//dependencies for each module used
var express = require('express');
var passport = require('passport');
var InstagramStrategy = require('passport-instagram').Strategy;
//var SoundCloudStrategy = require('passport-soundcloud').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
var http = require('http');
var path = require('path');
var handlebars = require('express-handlebars');
var bodyParser = require('body-parser');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var dotenv = require('dotenv');
var mongoose = require('mongoose');
var Instagram = require('instagram-node-lib');
//var SoundCloud = require('soundcloud-node');
var Facebook = require('fbgraph');
var async = require('async');
var app = express();

var superuser = {};

//local dependencies
var models = require('./models');

//client id and client secret here, taken from .env
dotenv.load();
var INSTAGRAM_CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
var INSTAGRAM_CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
var INSTAGRAM_CALLBACK_URL = process.env.INSTAGRAM_CALLBACK_URL;

var FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
var FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
var FACEBOOK_REDIRECT_URL = process.env.FACEBOOK_REDIRECT_URL;

Instagram.set('client_id', INSTAGRAM_CLIENT_ID);
Instagram.set('client_secret', INSTAGRAM_CLIENT_SECRET);

//connect to database
mongoose.connect(process.env.MONGODB_CONNECTION_URL);
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function (callback) {
  console.log("Database connected succesfully.");
});

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Instagram profile is
//   serialized and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

//Instantiate the client
//var client = new SoundCloud(SOUNDCLOUD_CLIENT_ID, SOUNDCLOUD_CLIENT_SECRET, SOUNDCLOUD_CALLBACK_URL);

//Connect User
var oauthInit = function(req, res) {
  var url = client.getConnectUrl();
  res.writeHead(301, url);
  res.end();
};

//Get OAuth Token
//callback funtion from the connect url
var oauthHandleToken = function(req, res) {
  var query = req.query;

  client.getToken(query.code, function(err, tokens) {
    if (err)
      callback(err);
    else {
      callback(null, tokens);
    }
  });
};

passport.use(new FacebookStrategy({
  clientID: FACEBOOK_APP_ID,
  clientSecret: FACEBOOK_APP_SECRET,
  callbackURL: FACEBOOK_REDIRECT_URL
},
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
   models.User.findOne({
    "sc_id": profile.id
   }, function(err, user) {
      if (err) {
        return done(err); 
      }
      
      //didnt find a user
      if (!user) {
        newUser = new models.User({
          name: profile.name, 
          sc_id: profile.id,
          sc_access_token: accessToken
        });

        newUser.save(function(err) {
          if(err) {
            console.log(err);
          } else {
            console.log('user: ' + newUser.name + " created.");
          }
          return done(null, newUser);
        });
      } else {
        //update user here
        Facebook.setAccessToken(accessToken);
        user.sc_access_token = accessToken;
        superuser.access_token = accessToken;
        user.save();
        //superuser = user;
        console.log(superuser);
        process.nextTick(function () {
          // To keep the example simple, the user's Instagram profile is returned to
          // represent the logged-in user.  In a typical application, you would want
          // to associate the Instagram account with a user record in your database,
          // and return that user instead.
          return done(null, user);
        });
      }
   });
  }
));

// Use the InstagramStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and Instagram
//   profile), and invoke a callback with a user object.
passport.use(new InstagramStrategy({
    clientID: INSTAGRAM_CLIENT_ID,
    clientSecret: INSTAGRAM_CLIENT_SECRET,
    callbackURL: INSTAGRAM_CALLBACK_URL
  },
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
   models.User.findOne({
    "ig_id": profile.id
   }, function(err, user) {
      if (err) {
        return done(err); 
      }
      
      //didnt find a user
      if (!user) {
        newUser = new models.User({
          name: profile.username, 
          ig_id: profile.id,
          ig_access_token: accessToken
        });

        newUser.save(function(err) {
          if(err) {
            console.log(err);
          } else {
            console.log('user: ' + newUser.name + " created.");
          }
          return done(null, newUser);
        });
      } else {
        //update user here
        user.ig_access_token = accessToken;
        user.save();
        process.nextTick(function () {
          // To keep the example simple, the user's Instagram profile is returned to
          // represent the logged-in user.  In a typical application, you would want
          // to associate the Instagram account with a user record in your database,
          // and return that user instead.
          return done(null, user);
        });
      }
   });
  }
));


//Configures the Template engine
app.engine('handlebars', handlebars({defaultLayout: 'layout'}));
app.set('view engine', 'handlebars');
app.set('views', __dirname + '/views');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({ secret: 'keyboard cat',
                  saveUninitialized: true,
                  resave: true}));
app.use(passport.initialize());
app.use(passport.session());

//set environment ports and start application
app.set('port', process.env.PORT || 3000);

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { 
    return next(); 
  }
  res.redirect('/login');
}


function ensureAuthenticatedInstagram(req, res, next) {
  if (req.isAuthenticated() && !!req.user.ig_id) { 
    return next(); 
  }
  res.redirect('/login');
}

function ensureAuthenticatedFacebook(req, res, next) {
  if (req.isAuthenticated() && !!req.user.sc_id) { 
    return next(); 
  }
  res.redirect('/login');
}

//routes
app.get('/', function(req, res){
  res.render('login');
});

app.get('/login', function(req, res){
  res.render('login', { user: req.user });
});

app.get('/account', ensureAuthenticated, function(req, res){
  res.render('account', {user: req.user});
});


var imageArr = [];


app.get('/fb_c3', ensureAuthenticated, function(req, res){
    var query = models.User.where({ sc_id: req.user.sc_id });
    query.findOne(function (err, user) 
    {
      if (err) return err;
      if (user)
      {
        var array = [];
        Facebook.setAccessToken(user.sc_access_token);
        Facebook.get("/me/photos", function(err, res) {
        console.log(res);
          
          for (var i = 0; i < res.data.length; i++)
          {
            var someitem = res.data[i];
            var smallerItem;
            if(someitem.likes)
            {
              smallerItem = someitem.likes.data;
            }
            else
            {
              array.push(0);
            }
            console.log(smallerItem.length);
            array.push(smallerItem.length);
          }
          imageArr = array;
          
         });
          return res.json({users: imageArr});   
      }
    });
  });

var groupArr = [];

app.get('/fb_d3', ensureAuthenticated, function(req, res){
  var query = models.User.where({ sc_id: req.user.sc_id });
  query.findOne(function (err, user) 
  {
    var array = [];
    if (err) return err;
    if (user)
    {
      Facebook.setAccessToken(user.sc_access_token);
      Facebook.get("/me/groups", function(err, res) {
      for (var i = 0; i < res.data.length; i++)
      {
        var someItem = res.data[i];
        var smallerItem;
        //console.log(res.data[i].name);
        if(someItem.name)
        {
          smallerItem = someItem.name;
        
        }
        array.push(smallerItem);
        groupArr.push(smallerItem);
      }
      groupArr = array;
      //console.log(groupArr);
    });
      console.log(groupArr);
    }
    return res.json({users: groupArr});  
  });
});




//app.get('/fb_d3'), 

app.get('/igphotos', ensureAuthenticatedInstagram, function(req, res){
  var query  = models.User.where({ ig_id: req.user.ig_id });
  query.findOne(function (err, user) {
    if (err) return err;
    if (user) {
      // doc may be null if no document matched
      Instagram.users.liked_by_self({
        access_token: user.ig_access_token,
        complete: function(data) {
          console.log(data);
          //Map will iterate through the returned data obj
          var imageArr = data.map(function(item) {
            //create temporary json object
            tempJSON = {};
            tempJSON.url = item.images.low_resolution.url;
            //insert json object into image array
            return tempJSON;
          });
          res.render('photos', {photos: imageArr});
        }
      }); 
    }
  });
});



app.get('/igMediaCounts', ensureAuthenticatedInstagram, function(req, res){
  var query  = models.User.where({ ig_id: req.user.ig_id });
  query.findOne(function (err, user) {
    if (err) return err;
    if (user) {
      Instagram.users.follows({ 
        user_id: user.ig_id,
        access_token: user.ig_access_token,
        complete: function(data) {
          // an array of asynchronous functions
          var asyncTasks = [];
          var mediaCounts = [];
           
          data.forEach(function(item){
            asyncTasks.push(function(callback){
              // asynchronous function!
              Instagram.users.info({ 
                  user_id: item.id,
                  access_token: user.ig_access_token,
                  complete: function(data) {
                    mediaCounts.push(data);
                    callback();
                  }
                });            
            });
          });   
          // Now we have an array of functions, each containing an async task
          // Execute all async tasks in the asyncTasks array
          async.parallel(asyncTasks, function(err){
            // All tasks are done now
            if (err) return err;
            return res.json({users: mediaCounts});        
          });
        }
      });   
    }
  });
});

app.get('/visualization', ensureAuthenticatedInstagram, function (req, res){
  res.render('visualization');
}); 


app.get('/c3visualization', ensureAuthenticatedInstagram, function (req, res){
  res.render('c3visualization');
}); 

app.get('/fb_c3_vis', function (req, res){
  res.render('fb_c3_vis');
}); 

app.get('/fb_d3_vis', function (req, res){
  res.render('fb_d3_vis');
});

app.get('/auth/facebook',
passport.authenticate('facebook', { scope: ['user_status', 'user_photos', 'user_groups'] }));


app.get('/auth/instagram',
  passport.authenticate('instagram'),
  function(req, res){
    // The request will be redirected to Instagram for authentication, so this
    // function will not be called.
  });

app.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login'}),
  function(req, res) {

    res.redirect('/fb_c3_vis');
});

app.get('/auth/instagram/callback', 
  passport.authenticate('instagram', { failureRedirect: '/login'}),
  function(req, res) {
    res.redirect('/account');
  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

http.createServer(app).listen(app.get('port'), function() {
    console.log('Express server listening on port ' + app.get('port'));
});