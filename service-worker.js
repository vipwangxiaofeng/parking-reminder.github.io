// 服务工作者 - 用于处理后台通知和离线功能
self.addEventListener('install', function(event) {
  console.log('Service Worker: Installing...');
  self.skipWaiting(); // 立即激活新的服务工作者
});

self.addEventListener('activate', function(event) {
  console.log('Service Worker: Activated');
  // 清理旧缓存
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cache) {
          if (cache !== 'parking-reminder-cache-v1') {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// 处理推送事件
self.addEventListener('push', function(event) {
  console.log('Service Worker: Push Received');
  
  // 解析推送数据
  const data = event.data ? event.data.json() : {
    title: '停车提醒',
    body: '您的停车时间即将结束',
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png'
  };
  
  // 显示通知
  const options = {
    body: data.body,
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/icon-72x72.png',
    vibrate: [500, 200, 500], // 震动模式
    data: {
      url: data.url || '/',
      timestamp: Date.now()
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 处理通知点击事件
self.addEventListener('notificationclick', function(event) {
  console.log('Service Worker: Notification clicked');
  
  // 关闭通知
  event.notification.close();
  
  // 打开应用
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});

// 处理fetch事件 - 实现基本的离线功能
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // 缓存命中，返回缓存的资源
        if (response) {
          return response;
        }
        
        // 克隆请求，因为请求是流，只能使用一次
        const fetchRequest = event.request.clone();
        
        // 尝试从网络获取资源
        return fetch(fetchRequest).then(
          function(response) {
            // 确保响应有效
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // 克隆响应，因为响应是流，只能使用一次
            const responseToCache = response.clone();
            
            // 将新获取的资源添加到缓存
            caches.open('parking-reminder-cache-v1')
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          }
        ).catch(function(error) {
          console.log('Fetch failed; returning offline page instead.', error);
          
          // 如果网络请求失败，可以返回一个自定义的离线页面
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          
          return new Response('网络连接失败，请检查您的网络连接', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});
