'use strict';

var cheerio = require('cheerio');
var express = require('express'); 
var request = require('request'); 
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var async = require('async');
var Q = require('q');

var config = require('./config'); 
var utils = require('./utils');

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cookieParser());

app.get('/login', (req, res) => {
  var state = utils.generateRandomString(16);
  var scope = 'playlist-modify-public';

  res.cookie(config.stateKey, state);

  // your application requests authorization
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: config.spotify_client_id,
      scope,
      redirect_uri: config.spotify_redirect_uri,
      state
    }));
});

app.get('/callback', (req, res) => {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[config.stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(config.stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code,
        redirect_uri: config.spotify_redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(config.spotify_client_id + ':' + config.spotify_client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, (error, response, body) => {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token;
        var refresh_token = body.refresh_token;

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/generate', req => {
  var user = req.query.user;
  var from = req.query.year;
  var userId = req.query.id;
  var access_token = req.query.access_token;
  var options = {
    url: 'http://www.last.fm/user/' + user + '/library/tracks',
    qs: {
      from: from + '-01-01',
      rangetype: 'year'
    }
  };

  function addSong(playlistId, songIds, userId) {
    var options = {
      url: `https://api.spotify.com/v1/users/${userId}/playlists/${playlistId}/tracks`,
      qs: { uris: songIds.join(',') },
      headers: {
        'Authorization': 'Bearer ' + access_token
      }
    };

    request.post(options, (err, res) => {
      if (!err && res.statusCode === 201) {
        console.log('Songs Added!');
      } else {
        console.log('/====== Error adding song ======/');
        console.log(err, 'status code: ' + res.statusCode);
      }
    });
  }

  function createPlaylist(id, access_token, cb) {
    var options = {
      url: `https://api.spotify.com/v1/users/${id}/playlists`,
      body: JSON.stringify({
        name: 'Nostalgia Playlist - ' + from,
        public: true
      }),
      headers: {
        'Authorization': 'Bearer ' + access_token
      },
    };

    request.post(options, (err, res, body) => {
      var playlist = JSON.parse(body);

      if (!err && res.statusCode === 201) {
        console.log('Playlist created');
        cb(playlist.id);
      } else {
        console.log('/====== Error creating playlist ======/');
        console.log(err, 'status code: ' + res.statusCode);
      }
    });
    
  }

  request(options, (err, res, body) => {
    if (!err && res.statusCode === 200) {
      var $ = cheerio.load(body, { ignoreWhitespace: true });
      var $tracks = $('.chartlist-artists');
      var urls = [];

      createPlaylist(userId, access_token, playlistId => {
        $tracks.each(function() {
          var artist = encodeURIComponent($(this).text().trim());
          var song = encodeURIComponent($(this).siblings('a').text().trim());
          var key = config.echonest_key;
          var echoBaseUrl = 'http://developer.echonest.com/api/v4/song/search';
          
          // I have to write this url out since it has two params named `bucket`
          // and querystring doesn't like that.
          var url = `${echoBaseUrl}?artist=${artist}&title=${song}&api_key=${key}&results=1&bucket=id:spotify&bucket=tracks`;

          urls.push(url);

        });

        function getIds(urls) {
          var songIds = [];

          async.map(urls, request, (err, res) => {
            if (!err) {
              res.forEach(track => {
                var trackInfo = JSON.parse(track.body);
                var songs = trackInfo.response.songs;
                var songId;

                if (songs.length && songs[0].tracks[0]) {
                  songId = songs[0].tracks[0].foreign_id;
                  
                  songIds.push(songId);
                  console.log(songId);
                }
              });
            } else {
              console.log(err);
            }

            addSong(playlistId, songIds, userId);
          });
        }

        getIds(urls.slice(0, 19));

        // I'm rate limited to 20 requests per min, so this is an awful, 
        // terrible "work around"
        setTimeout(() => {
          getIds(urls.slice(20, 39));
        }, 1000 * 65); // one min (plus 5 seconds just to be sure)

        setTimeout(() => {
          getIds(urls.slice(40, 49));
        }, 1000 * 125); // two mins (plus 5 seconds just to be sure)

      });

    } else {
      console.log(err);
    }
  });
});

console.log('Listening on 8888');
app.listen(8888);