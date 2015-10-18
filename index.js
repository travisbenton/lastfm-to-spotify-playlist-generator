'use strict';

var cheerio = require('cheerio');
var express = require('express'); 
var request = require('request'); 
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var async = require('async');

var client_id = '30ed07b8875f4f0d99cfeffe1079c8d6'; 
var client_secret = 'e65256bca6ca499eb7c0a30da78b6cd5'; 
var redirect_uri = 'http://localhost:8888/callback'; 

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
};

var stateKey = 'spotify_auth_state';
var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cookieParser());

app.get('/login', function(req, res) {
  var state = generateRandomString(16);
  var scope = 'playlist-modify-public';

  res.cookie(stateKey, state);

  // your application requests authorization
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id,
      scope,
      redirect_uri,
      state
    }));
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code,
        redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
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
        console.log('Song Added!');
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

      createPlaylist(userId, access_token, function(playlistId) {
        $tracks.each(function() {
          var artist = $(this).text().trim();
          var song = $(this).siblings('a').text().trim();

          urls.push(`http://developer.echonest.com/api/v4/song/search?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(song)}&api_key=CHG4YB2HXD66YR4KK&results=1&bucket=id:spotify&bucket=tracks`);

        });

        function getIds(urls) {
          var songIds = [];

          async.map(urls, request, (err, res) => {
            if (!err) {
              res.forEach(track => {
                var trackInfo = JSON.parse(track.body);
                var songId;

                if (trackInfo.response.songs && trackInfo.response.songs[0] && trackInfo.response.songs[0].tracks[0]) {
                  songId = trackInfo.response.songs[0].tracks[0].foreign_id;
                  
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

        // I'm rate limited to 20 requests per min, so this is an awful, terrible
        // "work around"
        setTimeout(() => {
          getIds(urls.slice(20, 49));
        }, 1000 * 65);

      });

    } else {
      console.log(err);
    }
  });
});

console.log('Listening on 8888');
app.listen(8888);