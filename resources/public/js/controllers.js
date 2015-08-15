var hsboxControllers = angular.module('hsboxControllers', []);

function getPlayerSummaries(steamids) {
    return serverUrl + '/steamids/info?steamids=' + steamids.join(',');
}

function demoOutcome(demoStats) {
    if (demoStats.winner == '2')
        outcome = 'Team A wins';
    else if (demoStats.winner == '3')
        outcome = 'Team B wins';
    else
        outcome = 'Draw';
    return outcome + '! ';
}

function timestamp2date(timestamp) {
    if (!timestamp)
        return '';
    d = new Date(timestamp * 1000);
    format = {day: 'numeric', month: 'short', hour: "2-digit", minute: "2-digit", hour12: false};
    if (d.getFullYear() != (new Date()).getFullYear())
        format.year = 'numeric';
    return d.toLocaleString(undefined, format);
};

function date2timestamp(date) {
    if (date)
        return Math.round(date / 1000);
    return null;
}

function watchDemoUrl(path, steamid, tick, highlight) {
    return 'steam://rungame/730/' + steamid + '/+playdemo "' +
        encodeURI(path) + (tick ? '@' + tick : '') + '" ' +
        (highlight ? steamid : '') +
        (highlight == 'lowlights' ? ' lowlights' : '');
}

function getBanTimestamp(player) {
    return date2timestamp(Date.now()) - 3600 * 24 * player['DaysSinceLastBan'];
}

function bannedSinceDemo(banTimestamp, demoTimestamp) {
    return ((banTimestamp - demoTimestamp) / (24 * 3600) | 0);
}

function banInfo(player) {
    var info = "";
    if (player == null)
        return "";
    if (player['NumberOfVACBans'] > 0)
        info = player['NumberOfVACBans'] + " VAC bans";
    if (player['NumberOfGameBans'] > 0) {
        if (info != "")
            info += ", ";
        info += player['NumberOfGameBans'] + " game bans";
    }
    return info;
}

function bansTooltip(player, demoTimestamp) {
    var tooltip = banInfo(player);
    if (tooltip != "") {
        tooltip += ", " + player['DaysSinceLastBan'] + " days since last ban";
        var banTimestamp = getBanTimestamp(player);
        if (banTimestamp >= demoTimestamp)
             return tooltip + " (" + bannedSinceDemo(banTimestamp, demoTimestamp) + " days since this game)";
    }
    return "";
}

function getStats($scope, $http) {
    var params = JSON.parse(JSON.stringify($scope.filterDemos));
    var teammates = [];
    $scope.filterTeammates.forEach(function (t) {
        teammates.push(t.steamid);
    });
    if (teammates.length > 0)
        params['teammates'] = teammates.join();
    $http.get(serverUrl + '/player/' + steamid + '/stats', {'params': params}).success(function(data) {
        $scope.stats = data;
        $scope.stats.weapons.forEach(function (p) {
            p.hs_percent = (p.hs / p.kills) * 100;
        });
    });
    $http.get(serverUrl + '/player/' + steamid + '/demos', {'params': params}).success(function(data) {
        $scope.demos = data;
        var $valveOnly = true;
        var $maps = {};
        $scope.demos.forEach(function (m) {
            m.kdd = m.kills - m.deaths;
            if (!m.timestamp)
                m.timestamp = 0;
            if (m.type != 'valve')
                $valveOnly = false;
            m.date = timestamp2date(m.timestamp);
            // Compute maps played
            var $before = $maps[m.map];
            if ($before == undefined)
                $before = 0;
            $maps[m.map] = $before + 1;
        });
        $scope.valveOnly = $valveOnly;
        $scope.mapsPlayedConfig.series[0].data = [];
        for (var key in $maps) {
            $scope.mapsPlayedConfig.series[0].data.push({name: key, y: $maps[key]});
        }
    });
}

hsboxControllers.controller('Player', function ($scope, $http, $routeParams, $sce, $rootScope) {
    $scope.valveOnly = false;
    $scope.playerMaps = [];
    $scope.playerTeammates = [];
    $scope.banned = []
    $scope.filteredBanned = [];
    $scope.opponentsOnly = true;
    $scope.filterBanned = function() {
        $scope.opponentsOnly = !$scope.opponentsOnly;
        $scope.filteredBanned = $scope.banned.filter(function (p) {
            if ($scope.opponentsOnly)
                return p.opponent;
            return true;
        });
    };
    $scope.filterDemos = {'startDate': null, 'endDate': null};
    $scope.filterTeammates = [];
    $scope.watchDemoUrl = watchDemoUrl;
    $scope.bannedSinceDemo = bannedSinceDemo;
    $scope.getBanTimestamp = getBanTimestamp;
    $scope.bansTooltip = bansTooltip;
    $scope.banInfo = banInfo;
    steamid = $routeParams.steamid;
    $scope.orderWeapons = '-kills';
    $scope.steamid = steamid;
    $scope.orderDemos = '-timestamp';
    $scope.orderBanned = 'DaysSinceLastBan';
    $scope.demoStats = {}
    $scope.steamAccounts = {}
    $scope.visibleDemo = ''
    $scope.visibleRound = 0
    $scope.orderTeams = '-kills';
    $scope.getPlayersInfo = function(missingPlayers) {
        if (missingPlayers.length == 0)
            return;
        $http.get(getPlayerSummaries(missingPlayers)).success(function (response) {
            for (var player in response) {
                $scope.steamAccounts[player] = response[player];
            }
        });
    };

    getStats($scope, $http);
    $http.get(getPlayerSummaries([steamid])).success(function (response) {
        $scope.player = response[steamid];
    });
    $http.get(serverUrl + '/player/' + steamid + '/maps').success(function(data) {
        $scope.playerMaps = data;
    });
    $http.get(serverUrl + '/player/' + steamid + '/teammates').success(function(data) {
        $scope.playerTeammates = data;
        missingPlayers = []
        $scope.playerTeammates.forEach(function (p) {
            if (!$scope.steamAccounts[p.steamid])
                missingPlayers[missingPlayers.length] = p.steamid;
        });
        $scope.getPlayersInfo(missingPlayers);
        if (!$scope.$$phase)
            $scope.$apply();
    });

    $scope.resetNotesControls = function() {
        $scope.notesControls = {'demoNotesInput': '', 'demoNotesView': ''};
    };
    $scope.linkToTick = function(demo, p1) {
        tick = parseInt(p1, 10);
        round = false;
        if (demo.lastIndexOf('round', 0) === 0) {
            tick = $scope.theDemo.rounds[tick - 1].tick;
            round = true;
        }
        return "<a href='" + watchDemoUrl($scope.theDemo.path, steamid, tick) + "'>" + demo + "</a>";
    }
    $scope.addLinks = function(text) {
        if (text == null)
            return "";
        text = text.replace(/(?:\r\n|\r|\n)/g, '<br />');
        return text.replace(/(?:(?:round|tick) ?)(\d+)/g, $scope.linkToTick);
    };
    $scope.updateDemoNotesView = function() {
        if (typeof $scope.notesControls.demoNotesInput != undefined)
            $scope.notesControls.demoNotesView = $sce.trustAsHtml($scope.addLinks($scope.notesControls.demoNotesInput));
    };
    $scope.updateDemoNotes2 = function() {
        if ($rootScope.isAuthorized)
            $http.post(serverUrl + '/demo/' + $scope.visibleDemo + '/notes', {'notes': $scope.notesControls.demoNotesInput}).success(function() {
                $scope.updateDemoNotesView();
            });
    }

    $scope.resetNotesControls();
    $scope.doMakeVisible = function(demoid, round) {
        $scope.resetNotesControls();
        $scope.visibleDemo = demoid;
        $scope.theDemo = $scope.demoStats[demoid];
        $scope.visibleRound = round;
        $http.get(serverUrl + '/demo/' + demoid + '/notes').success(function (response) {
            if ($scope.visibleDemo == demoid) {
                $scope.demoStats[$scope.visibleDemo].notes = response.notes;
                $scope.notesControls['demoNotesInput'] = response.notes;
                $scope.updateDemoNotesView();
            }
        });
    };
    $scope.makeVisible = function(demoid, round) {
        round = typeof round !== 'undefined' ? round : 0;
        if ($scope.visibleDemo != demoid) {
            if (!$scope.demoStats[demoid]) {
                $http.get(serverUrl + '/demo/' + demoid + '/stats').success(function(data) {
                    $scope.demoStats[demoid] = data;
                    $scope.doMakeVisible(demoid, round);

                    // Compute kdd and fetch steamids data from steam
                    missingPlayers = [];
                    for (var key in $scope.theDemo.teams) {
                        if ($scope.theDemo.teams.hasOwnProperty(key)) {
                            $scope.theDemo.teams[key].forEach(function (p) {
                                p.kdd = p.kills - p.deaths;
                                if (!$scope.steamAccounts[p.steamid])
                                    missingPlayers[missingPlayers.length] = p.steamid;
                            });
                        }
                    }
                    $scope.getPlayersInfo(missingPlayers);
                });
            } else
                $scope.doMakeVisible(demoid, round);

        }
        else if ($scope.visibleRound == round) {
            $scope.visibleRound = 0;
            $scope.visibleDemo = '';
            $scope.theDemo = '';
        } else {
            $scope.doMakeVisible(demoid, round);
        }
    };
    $scope.isVisible = function(demoid, round) {
        round = typeof round !== 'undefined' ? round : 0;
        return $scope.visibleDemo == demoid && $scope.visibleRound == round;
    };

    $scope.demoOutcome = demoOutcome;

    $scope.setDemoType = function(demoType) {
        $scope.filterDemos.demoType = demoType;
        getStats($scope, $http);
    };

    $scope.setMap = function(map) {
        $scope.filterDemos.mapName = map;
        getStats($scope, $http);
    };

    $scope.datepickerStatus = [false, false];
    $scope.openDatepicker = function($event, $no) {
        $event.preventDefault();
        $event.stopPropagation();
        $scope.datepickerStatus[$no] = true;
    };

    $scope.addTeammate = function(teammate) {
        if ($scope.filterTeammates.indexOf(teammate) != -1 || $scope.filterTeammates.length == 4)
            return;
        $scope.filterTeammates.push(teammate);
        getStats($scope, $http);
    };

    $scope.removeTeammate = function(teammate) {
        var $i = $scope.filterTeammates.indexOf(teammate);
        if ($i == -1)
            return;
        $scope.filterTeammates.splice($i, 1);
        getStats($scope, $http);
    };

    $scope.$watch('startDate', function() {
        var $changed = $scope.filterDemos.startDate != date2timestamp($scope.startDate);
        $scope.filterDemos.startDate = date2timestamp($scope.startDate);
        if ($changed)
            getStats($scope, $http);
    });
    $scope.$watch('endDate', function() {
        var $changed = $scope.filterDemos.endDate != date2timestamp($scope.endDate);
        $scope.filterDemos.endDate = date2timestamp($scope.endDate);
        if ($changed)
            getStats($scope, $http);
    });

    var setTabLoaded = function($content) {
        $scope.tabs.forEach(function(part, index, theArray) {
            if (theArray[index].content == $content) {
                theArray[index].isLoaded = true;
            }
        });
    }

    // Tabs
    var loadBanned = function() {
        $http.get(serverUrl + '/player/' + steamid + '/banned').success(function (data) {
            $scope.banned = data;
            $scope.banned.forEach(function (b) {
                b.last_played = timestamp2date(b.timestamp);
                b.ban_timestamp = getBanTimestamp(b);
                b.days_banned_after_last_played = bannedSinceDemo(b.ban_timestamp, b.timestamp);
            });
            $scope.filterBanned($scope.opponentsOnly);
            setTabLoaded('banned');
        });
    };
    $scope.tabs = [
        { heading: 'Demos', content: 'demos', icon: 'history', isLoaded: true },
        { heading: 'Weapon Stats', content: 'weapon_stats', icon: 'bullseye', isLoaded: true },
        { heading: 'Banned Players', content: 'banned', icon: 'ban', isLoaded: false, load: loadBanned },
        { heading: 'Search Round', content: 'search_round', icon: 'search', isLoaded: true },
        { heading: 'Charts', content: 'charts', icon: 'bar-chart', isLoaded: true }
    ];
    $scope.loadTab = function ($tab) {
        if ($tab.isLoaded || $tab.load == undefined)
            return;
        $tab.load();
    };

    // Charts
    $scope.mapsPlayedConfig = {
        options: {
            chart: {
                type: 'pie'
            },
            title: {
                text: 'Maps played'
            },
            plotOptions: {
                pie: {
                    dataLabels: {
                        enabled: true,
                        format: '{point.name}: {point.y}',
                        connectorColor: 'silver'
                    }
                }
            }
        },
        series: [{
            name: 'Matches',
            data: []
        }]
    }
});

hsboxControllers.controller('PlayerList', function ($scope, $http) {
    $http.get(serverUrl + '/players').success(function (data) {
        $scope.players = data;
        var steamIds = $scope.players.map(function(p) { return p.steamid; });
        var url = getPlayerSummaries(steamIds);
        $http.get(url).success(function (response) {
            for (var i in $scope.players) {
                player = $scope.players[i];
                if (response[player.steamid]) {
                    player.avatar = response[player.steamid].avatar;
                    player.personaname = response[player.steamid].personaname;
                }
            }
        });
    });
});

hsboxControllers.controller('RoundSearch', function ($scope, $http, $routeParams) {
    $scope.setOrder = function(field) {
        if ($scope.orderRounds == field)
            $scope.orderRounds = '-' + field;
        else
            $scope.orderRounds = field;
    }
    $scope.orderRounds = '-timestamp';
    $scope.watchDemoUrl = watchDemoUrl;
    $scope.roundHelpIsCollapsed = true;
    steamid = $routeParams.steamid;
    $scope.search_string = "";
    $scope.search = function() {
        $http.get(serverUrl + '/round/search', { params: {'search-string': steamid + ' ' + $scope.search_string} }).success(function(data) {
            $scope.rounds = data;
            $scope.rounds.forEach(function (r) {
                if (!r.timestamp)
                    r.timestamp = 0;
                r.date = timestamp2date(r.timestamp);
                if (r.won)
                    r.won_str = "Yes";
                else
                    r.won_str = "No";
            });
        });
    }
});

hsboxControllers.controller('Settings', function ($scope, $http, $rootScope) {
    $scope.steamApiCollapsed = true;
    $scope.demoDirectoryCollapsed = true;
    $scope.getSettings = function() {
        $http.get(serverUrl + '/config').success(function(data) {
            $scope.config = data;
        });
    };
    $scope.config = {};
    $scope.updateSettings = function() {
        $http.post(serverUrl + '/config', $scope.config).success(function(data) {
        });
    };

    $scope.invertIndexerState = function() {
        if (typeof $scope.indexerRunning === 'undefined')
            return;
        $http.post(serverUrl + '/indexer', {'running': !$scope.indexerRunning}).success(function(data) {
            $scope.getIndexerState();
        });
    };

    $scope.getIndexerState = function() {
        $http.get(serverUrl + '/indexer').success(function(data) {
            $scope.indexerRunning = data.running;
        });
    };

    $rootScope.$watch('isAuthorized', function() {
        if ($rootScope.isAuthorized) {
            $scope.getSettings();
            $scope.getIndexerState();
        }
    });
});

hsboxControllers.controller('Navbar', function ($scope, $http, $interval, $rootScope) {
    $rootScope.isAuthorized = false;
    $scope.active = 'player_list';
    $scope.version = '';
    $scope.newVersionAvailable = false;
    $scope.checkVersion = function($scope) {
        $http.get(serverUrl + '/version').success(function(data) {
            $scope.version = data.current;
            if (data.current != data.latest)
                $scope.newVersionAvailable = true;
        });
    };
    $scope.checkVersion($scope);
    $interval(function(){ $scope.checkVersion($scope); }, 1000 * 3600 * 24);
    // TODO user route params to set active?

    $rootScope.getAuthorizationState = function() {
        $http.get(serverUrl + '/authorized').success(function(data) {
            $rootScope.isAuthorized = data.authorized;
        });
    };

    $rootScope.getAuthorizationState();
});
