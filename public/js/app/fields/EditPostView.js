define(["app/app",
        "ember",
        "autosize"], function(App, Ember, autosize) {
  "use strict";

  App.EditPostView = Ember.TextArea.extend(Ember.TargetActionSupport, {
    classNames: ['edit-post-area'],
    rows: '2',
    attributeBindings: ['rows'],
    valueBinding: 'parentView.controller.body',
    action: 'update',

    keyPress: function (e) {
      if (e.which === 13) {
        return false
      }
    },

    becomeFocused: function() {
      this.$().focus()
      autosize(this.$())
    }.on('didInsertElement')
  })
})
