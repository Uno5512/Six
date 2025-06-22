class DistributedStorage {
  constructor(nodeId) {
    this.nodeId = nodeId;
    this.role = this.determineRole();
    this.localData = new Map();
    this.replicatedData = new Map();
    this.metadata = new Map();
    this.peers = new Map();

    this.state = {
      isLeader: false,
      lastSync: Date.now(),
      version: 0,
      health: 'healthy'
    };

    this.conflictLog = [];
    this.lastHeartbeat = new Map();

    this.initializeNode();

    // Запуск автоочистки каждые 6 часов
    setInterval(() => {
      this.cleanupOldPosts();
    }, 6 * 60 * 60 * 1000);
  }

  // ПЕРЕМЕСТИТЬ ВСЕ ЭТИ ФУНКЦИИ ВНУТРЬ КЛАССА:
  
  selectStorageNodes(eventId) {
    const hash = crypto.createHash('sha256').update(eventId).digest('hex');
    const nodeIndex = parseInt(hash.slice(0, 2), 16) % 2;

    const storageNodes = this.getActivePeers().filter(p => p.role === 'storage');

    if (storageNodes.length >= 2) {
      const primaryNode = nodeIndex === 0 ? 'storage-001' : 'storage-002';
      const replicaNode = nodeIndex === 0 ? 'storage-002' : 'storage-001';
      return { primary: primaryNode, replica: replicaNode };
    }

    return { primary: this.nodeId, replica: null };
  }

  cleanupOldPosts() {
    if (this.role === 'gateway') return;

    const now = Date.now();
    const TTL = 30 * 24 * 60 * 60 * 1000;
    const deleted = [];

    for (const [id, post] of this.localData.entries()) {
      const age = now - post.timestamp;

      if (age > TTL) {
        this.localData.delete(id);
        deleted.push(id);

        this.broadcastToPeers({
          type: 'post_expired',
          postId: id,
          reason: 'ttl_expired',
          timestamp: Date.now(),
          nodeId: this.nodeId
        });
      }
    }

    if (deleted.length > 0) {
      console.log(`🗑️ ${this.role} cleaned up ${deleted.length} expired posts`);
    }
  }

  determineRole() {
    const envRole = process.env.NODE_ROLE;
    if (envRole && ['master', 'storage', 'cache', 'gateway'].includes(envRole)) {
      return envRole;
    }

    if (this.nodeId.includes('master')) return 'master';
    if (this.nodeId.includes('storage')) return 'storage';
    if (this.nodeId.includes('cache')) return 'cache';
    if (this.nodeId.includes('gateway')) return 'gateway';

    const hash = crypto.createHash('sha256').update(this.nodeId).digest('hex');
    const hashValue = parseInt(hash.slice(0, 8), 16);
    const position = (hashValue % 1000) / 1000;

    if (position < 0.167) return 'master';
    if (position < 0.5) return 'storage';
    if (position < 0.833) return 'cache';
    return 'gateway';
  }

  cleanupCacheData() {
    if (this.role !== 'cache') return;
    
    const now = Date.now();
    const deleted = [];
    
    for (const [id, post] of this.localData.entries()) {
      const age = now - post.timestamp;
      let shouldDelete = false;
      
      if (this.cacheType === 'hot') {
        shouldDelete = age > this.cacheTTL && post.likes.length < 5;
      } else {
        shouldDelete = age > this.cacheTTL;
      }
      
      if (shouldDelete) {
        this.localData.delete(id);
        deleted.push(id);
      }
    }
    
    if (deleted.length > 0) {
      console.log(`🗑️ ${this.nodeId} (${this.cacheType}) cleaned ${deleted.length} cached posts`);
    }
  }
