define(["config",
        "app/app",
        "socket.io"], function(config, App, io) {
  "use strict";

  var PubSubServiceClass = Ember.Object.extend({
    subscribedTo: {},

    disconnect: function(data) {
      this.reconnect()
    },

    init: function() {
      this._super()

      this.set('socket', io.connect(config.host + '/', {
        query: 'token=' + App.get('Session.authToken')
      }))

      this.get('socket').on('post:new', this.newPost.bind(this))
      this.get('socket').on('post:update', this.updatePost.bind(this))
      this.get('socket').on('post:destroy', this.destroyPost.bind(this))
      this.get('socket').on('post:hide', this.hidePost.bind(this))
      this.get('socket').on('post:unhide', this.unhidePost.bind(this))

      this.get('socket').on('comment:new', this.newComment.bind(this))
      this.get('socket').on('comment:update', this.updateComment.bind(this))
      this.get('socket').on('comment:destroy', this.destroyComment.bind(this))

      this.get('socket').on('like:new', this.newLike.bind(this))
      this.get('socket').on('like:remove', this.removeLike.bind(this))

      this.get('socket').on('disconnect', this.disconnect.bind(this))
    },

    monitor: function() {
      var channel = this.get('channel')
      if (channel) {
        if (channel.constructor === App.Timeline)
          this.subscribe('timeline', channel.get('id'))
        else if (channel.constructor === App.Post)
          this.subscribe('post', channel.get('id'))
        else if (channel.constructor === Ember.ArrayProxy) {
          channel.get('content').forEach(function(post) {
            this.subscribe('post', post.get('id'))
          }, this)
        }
      }
    }.observes('channel', 'channel.id', 'channel.content.length'),

    subscribe: function(channel, ids) {
      if (!ids) return

      var subscribedTo = {}
      var that = this
      if (!$.isArray(ids))
        ids = [ids]

      if (this.subscribedTo[channel]) {
        ids.forEach(function(id) {
          var indexOfThisId = that.subscribedTo[channel].indexOf(id)
          if (indexOfThisId == -1) {
            that.subscribedTo[channel].push(id)
          }
        })
      } else {
        this.subscribedTo[channel] = ids
      }

      subscribedTo[channel] = ids
      this.socket.emit('subscribe', subscribedTo)
    },

    unsubscribe: function(channel, ids) {
      var unsubscribedTo = {}
      var that = this

      if (channel && ids) {
        if (this.subscribedTo[channel]) {
          if (!$.isArray(ids)) {
            ids = [ids]
          }
          ids.forEach(function(id) {
            var indexOfThisId = that.subscribedTo[channel].indexOf(id)
            if (indexOfThisId != -1) {
              unsubscribedTo[channel].push(id)
              that.subscribedTo[channel].splice(indexOfThisId, 1)
            }
          })
        }
      } else if(channel && !ids) {
        unsubscribedTo[channel] = this.subscribedTo[channel]
      } else if (!channel) {
        unsubscribedTo = this.subscribedTo
      }

      this.subscribedTo = {}
      this.set('channel', null)
      this.socket.emit('unsubscribe', unsubscribedTo)
    },

    reconnect: function() {
      var subscribedTo = this.get('subscribedTo')
      this.unsubscribe()
      this.get('socket').emit('subscribe', subscribedTo)
    },

    isFirstPage: function() {
      var offset = this.currentController().get('offset')
      return offset === 0 || offset === undefined
    },

    currentController: function() {
      var currentHandlerInfos = this.get('mainRouter').router.currentHandlerInfos
      var controller = currentHandlerInfos[currentHandlerInfos.length - 1].handler.controller

      return controller
    },

    newPost: function(data) {
      if (!this.isFirstPage())
        return

      var post = this.get('mainStore').getById('post', data.posts.id)
      if (!post) {
        this.get('mainStore').pushPayload('post', data)
        var that = this
        Ember.run.next(function() {
          post = that.get('mainStore').getById('post', data.posts.id)

          that.currentController().get('model.posts').unshiftObject(post)
        })
      }
    },

    updatePost: function(data) {
      var post = this.get('mainStore').getById('post', data.posts.id)
      if (post) {
        post.set('body', data.posts.body)
      }
    },

    destroyPost: function(data) {
      var post = this.get('mainStore').getById('post', data.meta.postId)
      if (post) {
        var posts = this.currentController().get('model.posts')
        if (posts)
          posts.removeObject(post)
      }
    },

    hidePost: function(data) {
      var post = this.get('mainStore').getById('post', data.meta.postId)

      if (post) {
        post.set('isHidden', true)
      }
    },

    unhidePost: function(data) {
      var post = this.get('mainStore').getById('post', data.meta.postId)

      if (post) {
        post.set('isHidden', false)
      }
    },

    newComment: function(data) {
      if (!this.isFirstPage())
        return

      var that = this
      var post = this.get('mainStore').getById('post', data.comments.postId)
      var currentUser = this.currentController().get('session.currentUser')
      var banIds = []
      if (currentUser)
        banIds = currentUser.get('banIds')

      if (banIds.indexOf(data.comments.createdBy) >= 0)
        return

      if (post) {
        if (!this.get('mainStore').recordIsLoaded('comment', data.comments.id)) {
          this.get('mainStore').pushPayload('comment', data)
          var comment = this.get('mainStore').getById('comment', data.comments.id)
          comment.set('isRealtime', true)

          post.get('comments').pushObject(comment)
        }
      } else {
        this.get('mainStore').find('post', data.comments.postId)
          .then(function(post) {
            that.currentController().get('model.posts').unshiftObject(post)
          })
      }
    },

    updateComment: function(data) {
      var commentId = data.comments.id

      if (this.get('mainStore').recordIsLoaded('comment', commentId)) {
        var comment = this.get('mainStore').getById('comment', commentId)
        comment.set('body', data.comments.body)
      }
    },

    destroyComment: function(data) {
      var comment = this.get('mainStore').getById('comment', data.commentId)

      if (!comment)
        return

      if (!comment.get('isDeleted')) {
        this.get('mainStore').unloadRecord(comment)

        var post = this.get('mainStore').getById('post', data.postId)
        comment = post.get('comments').findProperty('id', comment.get('id'))
        post.get('comments').removeObject(comment)
      }
    },

    newLike: function(data) {
      if (!this.isFirstPage())
        return

      var that = this
      var userId = data.users.id
      var currentUser = this.currentController().get('session.currentUser')
      var banIds = []
      if (currentUser)
        banIds = currentUser.get('banIds')

      if (banIds.indexOf(userId) >= 0)
        return


      if (!this.get('mainStore').recordIsLoaded('user', userId)) {
        this.get('mainStore').pushPayload('user', data)
      }

      var post = this.get('mainStore').getById('post', data.meta.postId)

      if (post) {
        var user = this.get('mainStore').getById('user', userId)
        post.get('likes').addObject(user)
      } else {
        this.get('mainStore').find('post', data.meta.postId)
          .then(function(post) {
            that.currentController().get('model.posts').unshiftObject(post)
          })
      }
    },

    removeLike: function(data) {
      var post = this.get('mainStore').getById('post', data.meta.postId)

      if (post) {
        var user = post.get('likes').findProperty('id', data.meta.userId)
        post.get('likes').removeObject(user)
      }
    }
  })

  Ember.Application.initializer({
    name: 'pubsub',
    after: 'session',

    initialize: function(container, application) {
      var PubSubService = PubSubServiceClass.create({
        mainRouter: container.lookup('router:main'),
        mainStore: container.lookup('store:main')
      });

      application.register('user:pubsub', PubSubService, { instantiate: false, singleton: true })
      application.inject('route', 'pubsub', 'user:pubsub')
    }
  })
})
