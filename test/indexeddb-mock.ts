class MockIDBRequest {
  onsuccess: any;
  onerror: any;
  onupgradeneeded: any;
  result: any;
  error: any;

  constructor() {
    this.onsuccess = null;
    this.onerror = null;
    this.onupgradeneeded = null;
    this.result = null;
    this.error = null;
  }
}

class MockIDBDatabase {
  name: string;
  version: number;
  objectStores: Map<string, MockIDBObjectStore>;

  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
    this.objectStores = new Map();
  }

  get objectStoreNames() {
    const keys = Array.from(this.objectStores.keys());
    return {
      contains: (name: string) => this.objectStores.has(name),
      length: keys.length,
      item: (index: number) => keys[index],
      entries: () => keys.entries()
    } as any;
  }

  createObjectStore(name: string, options?: any) {
    const store = new MockIDBObjectStore(name, options);
    this.objectStores.set(name, store);
    return store;
  }

  transaction(storeNames: any, mode: any) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const tx = new MockIDBTransaction(this, names, mode);
    return tx;
  }
}

class MockIDBTransaction {
  db: MockIDBDatabase;
  storeNames: string[];
  mode: string;
  oncomplete: any;
  onerror: any;

  constructor(db: MockIDBDatabase, storeNames: string[], mode: string) {
    this.db = db;
    this.storeNames = storeNames;
    this.mode = mode;
    this.oncomplete = null;
    this.onerror = null;
    setTimeout(() => {
      if (this.oncomplete) this.oncomplete();
    }, 5);
  }

  objectStore(name: string) {
    const store = this.db.objectStores.get(name);
    if (!store) throw new Error(`Store ${name} not found`);
    return store;
  }
}

class MockIDBIndex {
  store: MockIDBObjectStore;

  constructor(store: MockIDBObjectStore) {
    this.store = store;
  }

  getAll(key: any) {
    const req = new MockIDBRequest();
    setTimeout(() => {
      const results = Array.from(this.store.data.values()).filter(val => {
        return val.activityId === key || val.activity_id === key;
      });
      req.result = results;
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  }
}

class MockIDBObjectStore {
  name: string;
  options: any;
  data: Map<any, any>;

  constructor(name: string, options = {}) {
    this.name = name;
    this.options = options;
    this.data = new Map();
  }

  createIndex(name: string, keyPath: any, options = {}) {
    // no-op mock
  }

  index(name: string) {
    return new MockIDBIndex(this);
  }

  getAll() {
    const req = new MockIDBRequest();
    setTimeout(() => {
      req.result = Array.from(this.data.values());
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  }

  get(key: any) {
    const req = new MockIDBRequest();
    setTimeout(() => {
      req.result = this.data.get(key) || null;
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  }

  put(value: any, optionalKey?: any) {
    const req = new MockIDBRequest();
    const key = this.options.keyPath ? value[this.options.keyPath] : optionalKey;
    this.data.set(key, value);
    setTimeout(() => {
      req.result = key;
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  }

  delete(key: any) {
    const req = new MockIDBRequest();
    this.data.delete(key);
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  }
}

const mockDatabases = new Map<string, MockIDBDatabase>();

(globalThis as any).indexedDB = {
  open(name: string, version: number) {
    const req = new MockIDBRequest();
    setTimeout(() => {
      let db = mockDatabases.get(name);
      let oldVersion = 0;
      if (!db) {
        db = new MockIDBDatabase(name, version);
        mockDatabases.set(name, db);
      } else {
        oldVersion = db.version;
        db.version = version;
      }
      
      if (oldVersion < version) {
        req.result = db;
        const event = { oldVersion, newVersion: version };
        if (req.onupgradeneeded) req.onupgradeneeded(event);
      }
      
      req.result = db;
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  }
};
export {};
