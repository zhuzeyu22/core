import RightOutlined from '@ant-design/icons/RightOutlined';
import classNames from 'classnames';
import RCDropdown from 'rc-dropdown';
import React from 'react';

import { tuple } from '../utils/type';
import { warning } from '../utils/warning';

const Placements = tuple('topLeft', 'topCenter', 'topRight', 'bottomLeft', 'bottomCenter', 'bottomRight');
export type Placement = (typeof Placements)[number];

type OverlayFunc = () => React.ReactNode;

interface Align {
  points?: [string, string];
  offset?: [number, number];
  targetOffset?: [number, number];
  overflow?: {
    adjustX?: boolean;
    adjustY?: boolean;
  };
  useCssRight?: boolean;
  useCssBottom?: boolean;
  useCssTransform?: boolean;
}

export interface DropDownProps {
  trigger?: ('click' | 'hover' | 'contextMenu')[];
  overlay: React.ReactNode | OverlayFunc;
  onVisibleChange?: (visible: boolean) => void;
  visible?: boolean;
  disabled?: boolean;
  align?: Align;
  getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
  prefixCls?: string;
  className?: string;
  transitionName?: string;
  placement?: Placement;
  overlayClassName?: string;
  overlayStyle?: React.CSSProperties;
  forceRender?: boolean;
  mouseEnterDelay?: number;
  mouseLeaveDelay?: number;
  openClassName?: string;
}

export default class Dropdown extends React.Component<DropDownProps, any> {
  static defaultProps = {
    mouseEnterDelay: 0.15,
    mouseLeaveDelay: 0.1,
    placement: 'bottomLeft' as Placement,
  };

  getTransitionName() {
    const { placement = '', transitionName } = this.props;
    if (transitionName !== undefined) {
      return transitionName;
    }
    if (placement.indexOf('top') >= 0) {
      return 'slide-down';
    }
    return 'slide-up';
  }

  renderOverlay = (prefixCls: string) => {
    // rc-dropdown already can process the function of overlay, but we have check logic here.
    // So we need render the element to check and pass back to rc-dropdown.
    const { overlay } = this.props;

    let overlayNode;
    if (typeof overlay === 'function') {
      overlayNode = (overlay as OverlayFunc)();
    } else {
      overlayNode = overlay;
    }
    overlayNode = React.Children.only(overlayNode) as React.ReactElement<any>;

    const overlayProps = overlayNode.props;

    // Warning if use other mode
    warning(
      !overlayProps.mode || overlayProps.mode === 'vertical',
      `[Dropdown] mode="${overlayProps.mode}" is not supported for Dropdown's Menu.`,
    );

    // menu cannot be selectable in dropdown defaultly
    // menu should be focusable in dropdown defaultly
    const { selectable = false, focusable = true } = overlayProps;

    const expandIcon = (
      <span className={`${prefixCls}-menu-submenu-arrow`}>
        <RightOutlined className={`${prefixCls}-menu-submenu-arrow-icon`} />
      </span>
    );

    const fixedModeOverlay =
      typeof overlayNode.type === 'string'
        ? overlay
        : React.cloneElement(overlayNode, {
            mode: 'vertical',
            selectable,
            focusable,
            expandIcon,
          });

    return fixedModeOverlay;
  };

  renderDropDown = () => {
    const { prefixCls: customizePrefixCls, children, trigger, disabled, getPopupContainer } = this.props;

    const prefixCls = customizePrefixCls || 'kt-dropdown';
    const child = React.Children.only(children) as React.ReactElement<any>;

    const dropdownTrigger = React.cloneElement(child, {
      className: classNames(child.props.className, `${prefixCls}-trigger`),
      disabled,
    });

    const triggerActions = disabled ? [] : trigger;
    let alignPoint;
    if (triggerActions && triggerActions.indexOf('contextMenu') !== -1) {
      alignPoint = true;
    }

    return (
      <RCDropdown
        alignPoint={alignPoint}
        {...this.props}
        prefixCls={prefixCls}
        getPopupContainer={getPopupContainer}
        transitionName={this.getTransitionName()}
        trigger={triggerActions}
        overlay={() => this.renderOverlay(prefixCls)}
      >
        {dropdownTrigger}
      </RCDropdown>
    );
  };

  render() {
    return this.renderDropDown();
  }
}
