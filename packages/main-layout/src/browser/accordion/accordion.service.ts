import { Injectable, Autowired, INJECTOR_TOKEN, Injector } from '@ali/common-di';
import { View, CommandRegistry, ViewContextKeyRegistry, IContextKeyService, localize, IDisposable, DisposableCollection, DisposableStore, IContextKey, OnEvent, RenderedEvent, WithEventBus, ResizeEvent } from '@ali/ide-core-browser';
import { action, observable } from 'mobx';
import { SplitPanelManager, SplitPanelService } from '@ali/ide-core-browser/lib/components/layout/split-panel.service';
import { AbstractContextMenuService, AbstractMenuService, IMenu, IMenuRegistry, ICtxMenuRenderer, MenuId } from '@ali/ide-core-browser/lib/menu/next';
import { RESIZE_LOCK } from '@ali/ide-core-browser/lib/components';
import { LayoutState, LAYOUT_STATE } from '@ali/ide-core-browser/lib/layout/layout-state';

export interface SectionState {
  collapsed: boolean;
  hidden: boolean;
  size?: number;
  nextSize?: number;
}

@Injectable({multiple: true})
export class AccordionService extends WithEventBus {
  @Autowired()
  protected splitPanelManager: SplitPanelManager;

  @Autowired(AbstractMenuService)
  protected menuService: AbstractMenuService;

  @Autowired(AbstractContextMenuService)
  protected ctxMenuService: AbstractContextMenuService;

  @Autowired(IMenuRegistry)
  protected menuRegistry: IMenuRegistry;

  @Autowired(CommandRegistry)
  private commandRegistry: CommandRegistry;

  @Autowired(ICtxMenuRenderer)
  private readonly contextMenuRenderer: ICtxMenuRenderer;

  @Autowired()
  private viewContextKeyRegistry: ViewContextKeyRegistry;

  @Autowired(IContextKeyService)
  private contextKeyService: IContextKeyService;

  @Autowired()
  private layoutState: LayoutState;

  protected splitPanelService: SplitPanelService;

  @observable.shallow views: View[] = [];

  @observable state: {[containerId: string]: SectionState} = {};
  // 提供给Mobx强刷，有没有更好的办法？
  @observable forceUpdate: number = 0;

  rendered = false;

  private headerSize: number;
  private minSize: number;
  private menuId = `accordion/${this.containerId}`;
  private toDispose: Map<string, IDisposable> = new Map();

  private topViewKey: IContextKey<string>;
  private scopedCtxKeyService = this.contextKeyService.createScoped();

  constructor(public containerId: string, private noRestore?: boolean) {
    super();
    this.splitPanelService = this.splitPanelManager.getService(containerId);
    this.scopedCtxKeyService.createKey('triggerWithSection', true);
    this.menuRegistry.registerMenuItem(this.menuId, {
      command: {
        id: this.registerGlobalToggleCommand(),
        label: localize('layout.view.hide', '隐藏'),
      },
      group: '0_global',
      when: 'triggerWithSection == true',
    });
    this.viewContextKeyRegistry.afterContextKeyServiceRegistered(this.containerId, (contextKeyService) => {
      this.topViewKey = contextKeyService!.createKey('view', containerId);
      setTimeout(() => {
        // 由于tabbar.service会立刻设置view，这边要等下一个event loop
        this.popViewKeyIfOnlyOneViewVisible();
      });
    });
  }

  restoreState() {
    if (this.noRestore) { return; }
    const defaultState: {[containerId: string]: SectionState} = {};
    this.visibleViews.forEach((view) => defaultState[view.id] = { collapsed: false, hidden: false });
    const restoredState = this.layoutState.getState(LAYOUT_STATE.getContainerSpace(this.containerId), defaultState);
    this.state = restoredState;
    this.restoreSize();
    this.rendered = true;
  }

  // 调用时需要保证dom可见
  restoreSize() {
    // 计算存储总高度与当前窗口总高度差，加到最后一个展开的面板
    let availableSize = this.splitPanelService.rootNode.clientHeight;
    let finalUncollapsedIndex: number | undefined;
    this.visibleViews.forEach((view, index) => {
      const savedState = this.state[view.id];
      if (savedState.collapsed) {
        this.setSize(index, 0, false, true);
        availableSize -= this.headerSize;
      } else if (!savedState.collapsed && savedState.size) {
        this.setSize(index, savedState.size, false, true);
        availableSize -= savedState.size;
        finalUncollapsedIndex = index;
      }
    });
    if (finalUncollapsedIndex) {
      this.setSize(finalUncollapsedIndex, this.state[this.visibleViews[finalUncollapsedIndex].id].size! + availableSize);
    }
  }

  initConfig(config: { headerSize: number; minSize: number; }) {
    const {headerSize, minSize} = config;
    this.headerSize = headerSize;
    this.minSize = minSize;
  }

  getSectionToolbarMenu(viewId: string): IMenu {
    const scopedCtxKey = this.viewContextKeyRegistry.getContextKeyService(viewId);
    const menu = this.menuService.createMenu(MenuId.ViewTitle, scopedCtxKey);
    return menu;
  }

  appendView(view: View) {
    // 已存在的viewId直接替换
    const existIndex = this.views.findIndex((item) => item.id === view.id);
    if (existIndex !== -1) {
      this.views[existIndex] = Object.assign({}, this.views[existIndex], view);
      return;
    }
    const index = this.views.findIndex((value) => (value.priority || 0) < (view.priority || 0));
    this.views.splice(index === -1 ? this.views.length : index, 0, view);
    if (view.name === undefined) {
      console.warn(view.id + '视图未传入标题，请检查！');
    }
    this.viewContextKeyRegistry.registerContextKeyService(view.id, this.scopedCtxKeyService.createScoped()).createKey('view', view.id);
    this.toDispose.set(view.id, this.menuRegistry.registerMenuItem(this.menuId, {
      command: {
        id: this.registerVisibleToggleCommand(view.id),
        label: view.name || view.id,
      },
      group: '1_widgets',
      // TODO order计算
    }));
    this.popViewKeyIfOnlyOneViewVisible();
  }

  disposeView(viewId: string) {
    const existIndex = this.views.findIndex((item) => item.id === viewId);
    if (existIndex > -1) {
      this.views.splice(existIndex, 1);
    }
    const disposable = this.toDispose.get(viewId);
    if (disposable) {
      disposable.dispose();
    }
    this.popViewKeyIfOnlyOneViewVisible();
  }

  disposeAll() {
    this.views = [];
    this.toDispose.forEach((disposable) => {
      disposable.dispose();
    });
  }

  @OnEvent(ResizeEvent)
  protected onResize(e: ResizeEvent) {
    if (e.payload.slotLocation) {
      if (this.state[e.payload.slotLocation]) {
        const id = e.payload.slotLocation;
        // get dom of viewId
        const sectionDom = document.getElementById(id);
        if (sectionDom) {
          this.state[id].size = sectionDom.clientHeight;
          this.storeState();
        }
      }
    }
  }

  protected storeState() {
    if (this.noRestore || !this.rendered) { return; }
    this.layoutState.setState(LAYOUT_STATE.getContainerSpace(this.containerId), this.state);
  }

  private registerGlobalToggleCommand() {
    const commandId = `view-container.hide.${this.containerId}`;
    this.commandRegistry.registerCommand({
      id: commandId,
    }, {
      execute: ({viewId}: {viewId: string}) => {
        this.doToggleView(viewId);
      },
      isEnabled: () => {
        return this.visibleViews.length > 1;
      },
    });
    return commandId;
  }

  private registerVisibleToggleCommand(viewId: string): string {
    const commandId = `view-container.hide.${viewId}`;
    this.commandRegistry.registerCommand({
      id: commandId,
    }, {
      execute: ({forceShow}: {forceShow?: boolean}) => {
        this.doToggleView(viewId, forceShow);
      },
      isToggled: () => {
        const state = this.getViewState(viewId);
        return !state.hidden;
      },
      isEnabled: () => {
        const state = this.getViewState(viewId);
        return state.hidden || this.visibleViews.length > 1;
      },
    });
    return commandId;
  }

  protected doToggleView(viewId: string, forceShow?: boolean) {
    const state = this.getViewState(viewId);
    let nextState: boolean;
    if (forceShow === undefined) {
      nextState = !state.hidden;
    } else {
      nextState = !forceShow;
    }
    state.hidden = nextState;
    this.popViewKeyIfOnlyOneViewVisible();
    this.storeState();
  }

  popViewKeyIfOnlyOneViewVisible() {
    if (!this.topViewKey) {
      // 可能还没初始化
      return;
    }
    const visibleViews = this.visibleViews;
    if (visibleViews.length === 1) {
      this.topViewKey.set(visibleViews[0].id);
    } else {
      this.topViewKey.reset();
    }
  }

  toggleViewVisibility(viewId: string, show?: boolean) {
    this.doToggleView(viewId, show);
  }

  get visibleViews(): View[] {
    return this.views.filter((view) => {
      const viewState = this.getViewState(view.id);
      return !viewState.hidden;
    });
  }

  get expandedViews(): View[] {
    return this.views.filter((view) => {
      const viewState = this.state[view.id];
      return !viewState || viewState && !viewState.collapsed;
    });
  }

  @action.bound handleSectionClick(viewId: string, collapsed: boolean, index: number) {
    this.doToggleOpen(viewId, collapsed, index);
  }

  @action.bound handleContextMenu(event: React.MouseEvent, viewId?: string) {
    event.preventDefault();
    const menus = this.ctxMenuService.createMenu({
      id: this.menuId,
      config: { args: [{viewId}] },
      contextKeyService: viewId ? this.viewContextKeyRegistry.getContextKeyService(viewId) : undefined,
    });
    const menuNodes = menus.getGroupedMenuNodes();
    menus.dispose();
    this.contextMenuRenderer.show({ menuNodes: menuNodes[1], anchor: {
      x: event.clientX,
      y: event.clientY,
    } });
  }

  public getViewState(viewId: string) {
    let viewState = this.state[viewId];
    if (!viewState) {
      this.state[viewId] = { collapsed: false, hidden: false };
      viewState = this.state[viewId]!;
    }
    return viewState;
  }

  protected doToggleOpen(viewId: string, collapsed: boolean, index: number, noAnimation?: boolean) {
    const viewState = this.getViewState(viewId);
    viewState.collapsed = collapsed;
    let sizeIncrement: number;
    if (collapsed) {
      sizeIncrement = this.setSize(index, 0, false, noAnimation);
    } else {
      // 仅有一个视图展开时独占
      sizeIncrement = this.setSize(index, this.expandedViews.length === 1 ? this.getAvailableSize() : viewState.size || this.minSize, false, noAnimation);
    }
    // 下方视图被影响的情况下，上方视图不会同时变化
    let effected = false;
    // 从视图下方最后一个展开的视图起依次减去对应的高度
    for (let i = this.visibleViews.length - 1; i > index; i--) {
      if (this.getViewState(this.visibleViews[i].id).collapsed !== true) {
        sizeIncrement = this.setSize(i, sizeIncrement, true, noAnimation);
        effected = true;
        if (sizeIncrement === 0) {
          break;
        }
      }
    }
    if (!effected) {
      // 找到视图上方首个展开的视图减去对应的高度
      for (let i = index - 1; i >= 0; i--) {
        if ((this.state[this.visibleViews[i].id] || {}).collapsed !== true) {
          sizeIncrement = this.setSize(i, sizeIncrement, true, noAnimation);
          break;
        }
      }
    }
  }

  protected setSize(index: number, targetSize: number, isIncrement?: boolean, noAnimation?: boolean): number {
    const fullHeight = this.splitPanelService.rootNode.clientHeight;
    const panel = this.splitPanelService.panels[index];
    if (!noAnimation) {
      panel.classList.add('resize-ease');
    }
    if (!targetSize) {
      targetSize = this.headerSize;
      panel.classList.add(RESIZE_LOCK);
    } else {
      panel.classList.remove(RESIZE_LOCK);
    }
    // clientHeight会被上次展开的元素挤掉
    const prevSize = panel.clientHeight;
    const viewState = this.getViewState(this.visibleViews[index].id);
    let calcTargetSize: number = targetSize;
    // 视图即将折叠时、受其他视图影响尺寸变化时、主动展开时、resize时均需要存储尺寸信息
    if (isIncrement) {
      calcTargetSize = Math.max(prevSize - targetSize, this.minSize);
    }
    if (this.rendered) {
      if (targetSize === this.headerSize) {
        // 当前视图即将折叠且不是唯一展开的视图时，存储当前高度
        viewState.size = prevSize;
      } else {
        viewState.size = calcTargetSize;
      }
    }
    this.storeState();
    // panel.style.height = calcTargetSize / fullHeight * 100 + '%';
    viewState.nextSize = calcTargetSize;
    if (!noAnimation) {
      setTimeout(() => {
        // 动画 0.1s，保证结束后移除
        panel.classList.remove('resize-ease');
      }, 200);
    }
    return isIncrement ? calcTargetSize - (prevSize - targetSize) : targetSize - prevSize;
  }

  protected getAvailableSize() {
    const fullHeight = this.splitPanelService.rootNode.clientHeight;
    return fullHeight - (this.visibleViews.length - 1) * this.headerSize;
  }

}

export const AccordionServiceFactory = Symbol('AccordionServiceFactory');
