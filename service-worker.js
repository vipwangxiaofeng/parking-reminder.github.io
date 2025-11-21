// 服务工作者 - 用于处理后台通知和离线功能
const CACHE_NAME = 'parking-reminder-cache-v1';
const RUNTIME_CACHE_NAME = 'parking-reminder-runtime-v1';
const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/service-worker.js'
];

// 配置参数 - 提高缓存和网络请求的稳定性
const CACHE_CONFIG = {
  MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7天
  MAX_ENTRIES: 50, // 每个缓存的最大条目数
  NETWORK_TIMEOUT: 3000 // 网络请求超时时间（毫秒）
};

// 优化的错误记录，避免过多日志
function logError(message, error) {
  // 可以实现更复杂的日志逻辑，如错误聚合、采样等
  console.error(`Service Worker Error: ${message}`, error);
}

// 添加一些安全检查，防止缓存敏感数据
function isSensitiveRequest(request) {
  const url = new URL(request.url);
  // 检查URL是否包含敏感路径或参数
  const sensitivePaths = ['/api/login', '/api/auth', '/api/payment'];
  const sensitiveParams = ['token', 'password', 'creditcard'];
  
  return sensitivePaths.some(path => url.pathname.includes(path)) ||
         sensitiveParams.some(param => url.searchParams.has(param));
}

// 安装事件 - 预缓存关键资源（增强错误处理）
self.addEventListener('install', function(event) {
  console.log('Service Worker: Installing...');
  
  // 预缓存关键资源
  event.waitUntil(
    (async function() {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log('Service Worker: Caching files');
        
        // 逐个添加资源，即使某些资源失败也能继续
        const preCachePromises = CACHE_ASSETS.map(asset => {
          return cache.add(asset).catch(error => {
            console.warn(`Service Worker: 预缓存资源失败: ${asset}`, error);
            // 继续处理其他资源
          });
        });
        
        // 等待所有资源处理完成
        await Promise.allSettled(preCachePromises);
        
        console.log('Service Worker: 预缓存完成');
        return self.skipWaiting(); // 立即激活新的服务工作者
      } catch (error) {
        logError('安装Service Worker时发生错误', error);
        // 即使出错也继续安装，避免整个安装失败
      }
    })()
  );
});

// 激活事件 - 清理旧缓存并接管所有客户端（增强版）
self.addEventListener('activate', function(event) {
  console.log('Service Worker: Activated');
  
  // 清理旧缓存
  const cacheWhitelist = [CACHE_NAME, RUNTIME_CACHE_NAME];
  
  event.waitUntil(
    (async function() {
      try {
        // 清理旧缓存
        const cacheNames = await caches.keys();
        const deletePromises = cacheNames
          .filter(cacheName => !cacheWhitelist.includes(cacheName))
          .map(cacheName => {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          });
        
        await Promise.allSettled(deletePromises);
        
        console.log('Service Worker: Claiming clients for version', CACHE_NAME);
        await clients.claim(); // 确保新的SW立即控制所有客户端
        
        // 通知所有客户端有新版本
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED' });
        });
      } catch (error) {
        logError('激活Service Worker时发生错误', error);
        // 即使出错也继续激活过程
      }
    })()
  );
});

// 处理推送事件（增强版）
self.addEventListener('push', function(event) {
  console.log('Service Worker: Push Received');
  
  event.waitUntil(
    (async function() {
      try {
        // 解析推送数据，增加错误处理
        let data;
        try {
          data = event.data ? event.data.json() : {};
        } catch (e) {
          // 如果JSON解析失败，使用默认数据
          data = {
            title: '停车提醒',
            body: event.data ? event.data.text() : '您的停车时间即将结束'
          };
        }
        
        // 设置默认值和合并数据
        const defaultData = {
          title: '停车提醒',
          body: '您的停车时间即将结束',
          icon: 'https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/971ee1c214bc456c8fd247df475d0bdb~tplv-a9rns2rl98-image.image?rcl=2025112010042259BA8B64B465EB32C6D0&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1766196373&x-signature=xUvcVpcHJR7J6La7XcovoA3v%2FwI%3D',
          badge: 'https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/971ee1c214bc456c8fd247df475d0bdb~tplv-a9rns2rl98-image.image?rcl=2025112010042259BA8B64B465EB32C6D0&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1766196373&x-signature=xUvcVpcHJR7J6La7XcovoA3v%2FwI%3D'
        };
        
        // 合并默认数据和传入数据
        const mergedData = { ...defaultData, ...data };
        
        // 显示通知
        const options = {
          body: mergedData.body,
          icon: mergedData.icon,
          badge: mergedData.badge,
          vibrate: [500, 200, 500], // 震动模式
          data: {
            url: mergedData.url || '/',
            timestamp: Date.now(),
            id: mergedData.id || Math.random().toString(36).substr(2, 9),
            action: mergedData.action || 'default',
            ...mergedData.data
          },
          actions: mergedData.actions || [
            { action: 'view', title: '查看详情' },
            { action: 'extend', title: '延长时间' },
            { action: 'dismiss', title: '关闭' }
          ],
          // 增加通知类别
          tag: mergedData.tag || 'parking-reminder'
        };
        
        // 显示通知
        await self.registration.showNotification(mergedData.title, options);
        console.log('Service Worker: 通知显示成功');
      } catch (error) {
        logError('处理推送事件时出错', error);
        // 尝试显示基本通知，即使在出错情况下也能提供基本功能
        try {
          await self.registration.showNotification('停车提醒', {
            body: '收到停车相关通知，请查看应用',
            icon: 'https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/971ee1c214bc456c8fd247df475d0bdb~tplv-a9rns2rl98-image.image?rcl=2025112010042259BA8B64B465EB32C6D0&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1766196373&x-signature=xUvcVpcHJR7J6La7XcovoA3v%2FwI%3D',
            tag: 'parking-error'
          });
        } catch (notificationError) {
          console.error('Service Worker: 显示错误通知也失败', notificationError);
        }
      }
    })()
  );
});

// 处理通知点击事件（增强版）
self.addEventListener('notificationclick', function(event) {
  console.log('Service Worker: Notification clicked');
  
  // 关闭通知
  event.notification.close();
  
  // 根据通知的action和数据决定如何响应
  const action = event.action;
  const notificationData = event.notification.data || {};
  
  // 定义点击后的URL
  let urlToOpen = notificationData.url || '/';
  
  // 根据action参数修改URL
  if (action === 'view') {
    urlToOpen = `${urlToOpen}?notificationId=${notificationData.timestamp || Date.now()}&action=view&id=${notificationData.id || ''}`;
  } else if (action === 'extend') {
    // 延长停车时间的特定URL
    urlToOpen = `${urlToOpen}?action=extend&id=${notificationData.id || ''}`;
  } else if (action === 'dismiss') {
    // 如果是关闭操作，直接返回
    console.log('用户关闭了通知');
    return;
  }
  
  // 检查是否已经有打开的客户端窗口
  event.waitUntil(
    (async function() {
      try {
        // 获取所有客户端
        const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        
        // 检查是否已有打开的窗口
        for (const client of clientList) {
          if (client.url === urlToOpen || client.url.includes(urlToOpen.split('?')[0])) {
            // 如果找到匹配的窗口，聚焦它
            await client.focus();
            // 向客户端发送消息，告知通知点击事件
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              action,
              data: notificationData
            });
            return;
          }
        }
        
        // 如果没有找到匹配的窗口，打开新窗口
        if (clients.openWindow) {
          const newClient = await clients.openWindow(urlToOpen);
          // 如果成功打开了新窗口，可以向其发送消息
          if (newClient) {
            // 等待窗口加载完成再发送消息
            setTimeout(() => {
              newClient.postMessage({
                type: 'NOTIFICATION_CLICK',
                action,
                data: notificationData
              });
            }, 1000);
          }
        }
      } catch (error) {
        logError('处理通知点击事件时出错', error);
        // 即使出错也尝试打开基本页面
        if (clients.openWindow) {
          clients.openWindow('/');
        }
      }
    })()
  );
});

// 检查请求是否为静态资源
function isStaticAsset(request) {
  const url = new URL(request.url);
  // 检查文件扩展名或CDN URL
  const staticExtensions = ['.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext)) ||
         url.hostname.includes('cdn.jsdelivr.net') ||
         url.hostname.includes('cdn.tailwindcss.com');
}

// 缓存优先策略，但在后台更新缓存
async function cacheFirstWithUpdate(request) {
  try {
    // 先尝试从缓存获取
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // 缓存命中，返回缓存的响应
      // 同时在后台尝试更新缓存
      fetchAndCache(request, RUNTIME_CACHE_NAME).catch(() => {});
      return cachedResponse;
    }
    
    // 缓存未命中，从网络获取并缓存
    return await fetchAndCache(request, RUNTIME_CACHE_NAME);
  } catch (error) {
    logError('缓存优先策略执行失败', error);
    // 如果所有都失败，尝试返回离线页面
    return caches.match('/');
  }
}

// 网络优先策略，但有超时处理
async function networkFirstWithTimeout(request, timeoutMs) {
  try {
    // 创建带超时的fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    // 尝试网络请求
    const networkResponse = await fetch(request, {
      signal: controller.signal,
      // 添加重试机制
      credentials: 'include'
    });
    
    clearTimeout(timeoutId);
    
    // 检查响应是否有效
    if (networkResponse && networkResponse.ok) {
      // 缓存导航请求到运行时缓存
      if (request.mode === 'navigate') {
        const clonedResponse = networkResponse.clone();
        await caches.open(RUNTIME_CACHE_NAME).then(cache => cache.put(request, clonedResponse));
      }
      return networkResponse;
    }
    
    // 网络响应无效，尝试从缓存获取
    return await caches.match(request) || await caches.match('/');
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Service Worker: 网络请求超时，使用缓存');
    } else {
      logError('网络优先策略执行失败', error);
    }
    // 网络请求失败或超时，尝试从缓存获取
    return await caches.match(request) || await caches.match('/');
  }
}

// 从网络获取并缓存响应
async function fetchAndCache(request, cacheName) {
  try {
    // 检查是否是敏感请求，如果是则不缓存
    if (isSensitiveRequest(request)) {
      return await fetch(request);
    }
    
    const response = await fetch(request, {
      credentials: 'include'
    });
    
    // 检查响应是否有效
    if (!response || !response.ok || response.type !== 'basic') {
      return response;
    }
    
    // 克隆响应，一个用于返回，一个用于缓存
    const responseToCache = response.clone();
    
    // 将响应添加到缓存
    const cache = await caches.open(cacheName);
    await cache.put(request, responseToCache);
    
    // 管理缓存大小，避免缓存无限增长
    await trimCache(cacheName, CACHE_CONFIG.MAX_ENTRIES);
    
    return response;
  } catch (error) {
    logError('获取并缓存资源时出错', error);
    throw error;
  }
}

// 管理缓存大小，删除最旧的条目
async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    
    if (keys.length > maxEntries) {
      // 删除最旧的条目，保留最新的maxEntries个
      await Promise.all(
        keys.slice(0, keys.length - maxEntries).map(key => cache.delete(key))
      );
      console.log(`Service Worker: 已修剪缓存 ${cacheName}，保留最新的 ${maxEntries} 个条目`);
    }
  } catch (error) {
    logError('修剪缓存时出错', error);
  }
}

// 处理fetch事件 - 实现高级缓存策略（增强版）
self.addEventListener('fetch', function(event) {
  const request = event.request;
  
  // 忽略非GET请求和Chrome扩展请求
  if (request.method !== 'GET' || request.url.startsWith('chrome-extension://')) {
    return event.respondWith(fetch(request).catch(() => {
      return new Response('网络请求失败，请检查您的网络连接', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({
          'Content-Type': 'text/plain'
        })
      });
    }));
  }
  
  // 检查是否是敏感请求，如果是则不缓存
  if (isSensitiveRequest(request)) {
    return event.respondWith(
      fetch(request).catch(() => {
        return new Response('敏感请求无法完成，请检查您的网络连接', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      })
    );
  }
  
  // 检查是否是导航请求（加载页面）
  const isNavigationRequest = request.mode === 'navigate';
  
  if (isNavigationRequest) {
    // 对于导航请求，使用网络优先策略
    event.respondWith(
      networkFirstWithTimeout(request, CACHE_CONFIG.NETWORK_TIMEOUT)
    );
  } else if (isStaticAsset(request)) {
    // 对于静态资源，使用缓存优先策略
    event.respondWith(
      cacheFirstWithUpdate(request)
    );
  } else {
    // 对于API请求或其他资源，使用网络优先策略
    event.respondWith(
      fetch(request)
        .then(function(networkResponse) {
          // 检查响应是否有效
          if (!networkResponse || !networkResponse.ok) {
            return networkResponse;
          }
          
          // 克隆响应，一个用于返回，一个用于缓存
          const responseToCache = networkResponse.clone();
          
          // 将响应添加到运行时缓存
          caches.open(RUNTIME_CACHE_NAME)
            .then(function(cache) {
              cache.put(request, responseToCache);
            });
          
          return networkResponse;
        })
        .catch(function(error) {
          logError('Fetch failed for', error);
          
          // 网络失败时，尝试从缓存获取
          return caches.match(request);
        })
    );
  }
});

// 带重试功能的fetch
async function retryFetch(url, options, maxRetries) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        // 添加超时
        signal: AbortSignal.timeout(CACHE_CONFIG.NETWORK_TIMEOUT * 2)
      });
      
      if (response.ok) {
        return true;
      } else if (attempt < maxRetries && isRetryableError(response.status)) {
        // 对于可重试的错误，等待一段时间后重试
        const delay = Math.pow(2, attempt) * 1000; // 指数退避
        await new Promise(resolve => setTimeout(resolve, delay));
        lastError = new Error(`HTTP错误 ${response.status}`);
        continue;
      }
      
      return false;
    } catch (error) {
      if (attempt < maxRetries && isRetryableError(error)) {
        // 对于网络错误，也使用指数退避重试
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        lastError = error;
        continue;
      }
      
      lastError = error;
    }
  }
  
  console.error(`Service Worker: 所有${maxRetries}次重试都失败了`, lastError);
  return false;
}

// 判断是否是可重试的错误
function isRetryableError(errorOrStatus) {
  // HTTP状态码
  if (typeof errorOrStatus === 'number') {
    // 服务器错误和请求超时可以重试
    return errorOrStatus >= 500 || errorOrStatus === 408;
  }
  
  // 错误对象
  if (errorOrStatus instanceof Error) {
    // 网络错误、超时等可以重试
    return errorOrStatus.name === 'NetworkError' || 
           errorOrStatus.name === 'AbortError' ||
           errorOrStatus.message.includes('network') ||
           errorOrStatus.message.includes('timeout');
  }
  
  return false;
}

// 后台同步事件 - 用于在网络恢复时同步数据（增强版）
self.addEventListener('sync', function(event) {
  console.log('Service Worker: Background sync event', event.tag);
  
  if (event.tag === 'sync-parking-data') {
    event.waitUntil(
      syncParkingData().catch(error => {
        logError('后台同步失败', error);
        // 即使失败也不抛出异常，让同步机制可以重试
        return false;
      })
    );
  }
});

// 同步停车数据的辅助函数（增强版）
async function syncParkingData() {
  try {
    // 模拟从IndexedDB获取待同步数据
    // 实际实现中，这里应该从IndexedDB读取数据
    // 这里使用localStorage作为后备方案
    let pendingSyncs = [];
    try {
      const storedSyncs = localStorage.getItem('pendingSyncs');
      if (storedSyncs) {
        pendingSyncs = JSON.parse(storedSyncs);
      }
    } catch (e) {
      console.warn('读取待同步数据失败:', e);
      pendingSyncs = [];
    }
    
    console.log(`Service Worker: 找到 ${pendingSyncs.length} 条待同步数据`);
    
    // 如果没有待同步数据，直接返回成功
    if (pendingSyncs.length === 0) {
      console.log('Service Worker: 没有待同步数据');
      return true;
    }
    
    // 尝试同步数据到服务器
    // 添加重试机制
    const syncSuccess = await retryFetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        items: pendingSyncs,
        timestamp: Date.now()
      })
    }, 3); // 最多重试3次
    
    if (syncSuccess) {
      console.log('Service Worker: 数据同步成功');
      // 清除已同步的数据
      try {
        localStorage.removeItem('pendingSyncs');
      } catch (e) {
        console.warn('清除待同步数据失败:', e);
      }
      
      // 通知所有客户端同步成功
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_COMPLETED',
          timestamp: Date.now()
        });
      });
      
      return true;
    }
    
    console.error('Service Worker: 数据同步失败');
    return false;
  } catch (error) {
    logError('同步数据时出错', error);
    // 即使出错也返回false而不是抛出异常，让同步机制可以重试
    return false;
  }
}

// 消息事件处理，用于客户端和Service Worker之间通信
self.addEventListener('message', function(event) {
  const messageData = event.data || {};
  const type = messageData.type;
  const data = messageData.data;
  
  if (type === 'SYNC_NOW') {
    // 客户端请求立即同步
    syncParkingData().then(success => {
      event.source.postMessage({
        type: 'SYNC_RESPONSE',
        success,
        timestamp: Date.now()
      });
    });
  } else if (type === 'GET_VERSION') {
    // 返回当前Service Worker版本信息
    event.source.postMessage({
      type: 'VERSION_RESPONSE',
      version: CACHE_NAME,
      timestamp: Date.now()
    });
  } else if (type === 'CACHE_ASSETS') {
    // 客户端请求缓存特定资源
    if (Array.isArray(data.assets)) {
      data.assets.forEach(assetUrl => {
        fetch(assetUrl)
          .then(response => {
            if (response.ok) {
              return caches.open(RUNTIME_CACHE_NAME)
                .then(cache => cache.put(assetUrl, response));
            }
          })
          .catch(err => console.warn('缓存资源失败:', assetUrl, err));
      });
    }
  }
});

// 确保关键功能可用
console.log('Service Worker 加载成功，版本:', CACHE_NAME);

// 尝试注册后台同步（如果支持）
if ('SyncManager' in self) {
  // 这里只是示例，实际的后台同步应该由客户端触发
  console.log('浏览器支持后台同步');
} else {
  console.warn('浏览器不支持后台同步');
}
