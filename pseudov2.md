  PROJECT "test-app" {
      CREATE API "users" {
          LNG = python,
          METHOD GET  "/users"      -> "list all users",
          METHOD POST "/users"      -> "create a user with name, email",
          METHOD GET  "/users/{id}" -> "get user by id"
      },
      CREATE WEBUI "users-display" {
        LNG = React,
        DISPLAY API.USERS.GET -> "Show a list of all the users",
        DISPLAY API.USERS.POST -> "Create a form that will crate an user",
        DISPLAY API.USERS.GET.ID -> "Search bar to search users by id",
      }
  }