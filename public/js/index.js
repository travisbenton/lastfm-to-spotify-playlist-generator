(function() {
  var params, access_token, error, id;

  /**
   * Obtains parameters from the hash of the URL
   * @return Object
   */
  function getHashParams() {
    var hashParams = {};
    var e, r = /([^&;=]+)=?([^&;]*)/g;
    var q = window.location.hash.substring(1);

    while (e = r.exec(q)) {
       hashParams[e[1]] = decodeURIComponent(e[2]);
    }
    return hashParams;
  }

  params = getHashParams();
  access_token = params.access_token;
  error = params.error;

  if (error) {
    window.alert('There was an error during the authentication');
  } else {
    if (access_token) {
      $.ajax({
        url: 'https://api.spotify.com/v1/me',
        headers: {
          'Authorization': 'Bearer ' + access_token
        },
        success: function(data) {
          id = data.id;
          $('.login').hide();
          $('.loggedin').show();
        }
      });
    } else {
      $('.login').show();
      $('.loggedin').hide();
    }
  }

  $('.make-playlist').on('click', function() {
    var params = {
      year: $('#year').val(),
      user: $('#user').val(),
      id: id,
      access_token: access_token
    };

    $.ajax({
      url: '/generate',
      data: params,
      success: function(data) {
        console.log(data);
      }
    });

  });
})();