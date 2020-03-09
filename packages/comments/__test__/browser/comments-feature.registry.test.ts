import { createBrowserInjector } from '../../../../tools/dev-tool/src/injector-helper';
import { CommentsModule } from '../../src/browser';
import { Injector } from '@ali/common-di';
import { ICommentsService, CommentMode, ICommentsFeatureRegistry } from '../../src/common';
import { URI, positionToRange } from '@ali/ide-core-common';
import { IContextKeyService } from '@ali/ide-core-browser';
import { MockContextKeyService } from '@ali/ide-monaco/lib/browser/mocks/monaco.context-key.service';
import { createMockedMonaco } from '@ali/ide-monaco/lib/__mocks__/monaco';
import { MockInjector } from '../../../../tools/dev-tool/src/mock-injector';
import { IIconService } from '@ali/ide-theme';
import { IconService } from '@ali/ide-theme/lib/browser';

describe('comment service test', () => {
  let injector: MockInjector;
  let commentsService: ICommentsService;
  let commentsFeatureRegistry: ICommentsFeatureRegistry;
  beforeAll(() => {
    (global as any).monaco = createMockedMonaco() as any;
    injector = createBrowserInjector([ CommentsModule ], new Injector([{
      token: IContextKeyService,
      useClass: MockContextKeyService,
    }, {
      token: IIconService,
      useClass: IconService,
    }]));
    commentsService = injector.get<ICommentsService>(ICommentsService);
    commentsFeatureRegistry = injector.get<ICommentsFeatureRegistry>(ICommentsFeatureRegistry);
  });

  afterAll(() => {
    (global as any).monaco = undefined;
  });

  it('registerPanelOptions', () => {
    const options = {
      iconClass: 'iconClass',
      priority: 1,
      title: 'title',
      hidden: false,
      badge: 'badge',
      initialProps: { a: 1 },
    };
    commentsFeatureRegistry.registerPanelOptions(options);
    const registryOptions = commentsFeatureRegistry.getCommentsPanelOptions();

    expect(registryOptions).toEqual(options);
  });

  it('registerPanelOptions', () => {
    const options = {
      iconClass: 'iconClass',
      priority: 1,
      title: 'title',
      hidden: false,
      badge: 'badge',
      initialProps: { a: 1 },
    };
    commentsFeatureRegistry.registerPanelOptions(options);
    const registryOptions = commentsFeatureRegistry.getCommentsPanelOptions();

    expect(registryOptions).toEqual(options);
  });

  it('registerPanelTreeNodeHandler', () => {
    // 先绑定 node 节点处理函数
    commentsFeatureRegistry.registerPanelTreeNodeHandler((nodes) => {
      return nodes.map((node) => {
        node.name = '111';
        return node;
      });
    });
    const uri = URI.file('/test');
    commentsService.createThread(uri, positionToRange(1), {
      comments: [{
        mode: CommentMode.Editor,
        author: {
          name: '蛋总',
        },
        body: '评论内容1',
      }],
    });
    const nodes = commentsService.commentsTreeNodes;
    // name 不会是 test，而是被 handler 处理过的 111
    expect(nodes[0].name).toBe('111');
    expect(nodes[1].name).toBe('111');
  });
});
