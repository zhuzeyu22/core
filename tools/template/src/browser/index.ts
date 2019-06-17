import { Provider, Injectable } from '@ali/common-di';
import { SlotMap } from '@ali/ide-core-browser';
import { BrowserModule, SlotLocation } from '@ali/ide-core-browser';
import { HelloWorld } from './hello-world.view';

@Injectable()
export class TemplateUpperNameModule extends BrowserModule {
  providers: Provider[] = [];
  slotMap: SlotMap = new Map([
    [ SlotLocation.root, HelloWorld ],
  ]);
}
