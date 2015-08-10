define(["app/app",
        "ember",
        "mixins/TransitionalRoute"], function(App, Ember) {
  "use strict";

  App.CustomErrorRoute = Ember.Mixin.create(App.TransitionalRoute, {
    actions: {
      error: function(error) {
        this.controllerFor('application').displayError(error)
        this.transitionTo('timeline.home', { queryParams: { offset: 0 } })

        this.removeThrobber()
      }
    }
  })
})
