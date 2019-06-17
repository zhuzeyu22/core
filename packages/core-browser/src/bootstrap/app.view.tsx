import * as React from 'react';
import { ConfigProvider, /*SlotLocation,*/SlotRenderer } from '../react-providers';
import { IClientApp } from '../browser-module';
import {SlotLocation} from '../react-providers/slot';

export interface AppProps {
  app: IClientApp;
}

export function App(props: AppProps) {
  return (
    <ConfigProvider value={ props.app.config }>
      <SlotRenderer name={SlotLocation.root} />
    </ConfigProvider>
  );
}
