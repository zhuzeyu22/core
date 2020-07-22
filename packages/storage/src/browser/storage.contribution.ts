import { Domain, StorageResolverContribution, URI, IStorage, ClientAppContribution, STORAGE_SCHEMA, AppConfig, ILogger } from '@ali/ide-core-browser';
import { Autowired } from '@ali/common-di';
import { Storage } from './storage';
import { IStorageServer, IWorkspaceStorageServer, IGlobalStorageServer } from '../common';
import { IWorkspaceService } from '@ali/ide-workspace';

@Domain(StorageResolverContribution, ClientAppContribution)
export class DatabaseStorageContribution implements StorageResolverContribution, ClientAppContribution {

  @Autowired(IWorkspaceStorageServer)
  private workspaceStorage: IStorageServer;

  @Autowired(IGlobalStorageServer)
  private globalStorage: IStorageServer;

  @Autowired(AppConfig)
  private appConfig: AppConfig;

  @Autowired(IWorkspaceService)
  private workspaceService: IWorkspaceService;

  @Autowired(ILogger)
  private logger: ILogger;

  storage: IStorage;

  async resolve(storageId: URI) {
    const storageName = storageId.path.toString();
    let storage: IStorage;
    if (storageId.scheme === STORAGE_SCHEMA.SCOPE) {
      storage = new Storage(this.workspaceStorage, this.workspaceService, this.appConfig, storageName, this.logger);
    } else if (storageId.scheme === STORAGE_SCHEMA.GLOBAL) {
      storage = new Storage(this.globalStorage, this.workspaceService, this.appConfig, storageName, this.logger);
    } else {
      return;
    }
    // 等待后台存储模块初始化数据
    await storage.whenReady;

    this.storage = storage;

    return storage;
  }

  onReconnect() {
    if (this.storage) {
      this.storage.reConnectInit();
    }
  }
}
