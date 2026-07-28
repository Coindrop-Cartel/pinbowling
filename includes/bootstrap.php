<?php

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/config.php';

use App\Includes\Container;
use App\Http\Request;
use App\Http\Response;
use App\Http\JsonResponse;
use App\Http\RedirectResponse;
use App\Service\DatabaseService;
use App\Service\SettingsService;
use App\Service\AuthService;
use App\Service\PlayerService;
use App\Service\LeagueService;
use App\Service\EventService;
use App\Service\RosterService;
use App\Service\SeasonService;
use App\Service\PlayoffService;
use App\Service\LocationService;
use App\Service\MachineService;
use App\Service\ScoreService;
use App\Service\TeamScoreService;
use App\Service\TeamService;
use App\Service\TeamPlayoffService;
use App\Service\MatchupService;
use App\Service\TeamMatchupService;
use App\Service\CleanupService;
use App\Service\SessionService;

// 1. Create a Settings object from the Configuration singleton
$dbConfig = $config->getDbConfig();
$configSettings = [
    'dbHost' => $dbConfig['host'],
    'dbPort' => $dbConfig['port'],
    'dbName' => $dbConfig['name'],
    'dbUser' => $dbConfig['user'],
    'dbPass' => $dbConfig['pass'],
    'dbCharset' => $dbConfig['charset'],
    'dbDsn' => $dbDsn,
    'apiSecret' => $config->getApiSecret(),
    'adminPassword' => $config->getAdminPassword(),
    'uiVersion' => $uiVersion,
];
$settings = new SettingsService($configSettings);

// 2. Initialize the DI Container
$container = new Container();

// 3. Register Settings in container first (other services depend on it)
$container->setInstance(SettingsService::class, $settings);

// 4. Register DatabaseService
$container->set(DatabaseService::class, function (Container $c) {
    $cfg = $c->get(SettingsService::class);
    $pdo = new PDO($cfg->get('dbDsn'), $cfg->get('dbUser'), $cfg->get('dbPass'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return new DatabaseService($pdo);
});

// 5. Register AuthService
$container->set(AuthService::class, function (Container $c) {
    return new AuthService($c->get(DatabaseService::class), $c->get(SettingsService::class));
});

// 6. Register PlayerService
$container->set(PlayerService::class, function (Container $c) {
    return new PlayerService($c->get(DatabaseService::class));
});

// 7. Register LeagueService and its sub-services
$container->set(EventService::class, function (Container $c) {
    return new EventService($c->get(DatabaseService::class));
});
$container->set(RosterService::class, function (Container $c) {
    return new RosterService($c->get(DatabaseService::class));
});
$container->set(SeasonService::class, function (Container $c) {
    return new SeasonService($c->get(DatabaseService::class), $c->get(EventService::class));
});
$container->set(PlayoffService::class, function (Container $c) {
    return new PlayoffService($c->get(DatabaseService::class), $c->get(EventService::class));
});
$container->set(TeamPlayoffService::class, function (Container $c) {
    return new TeamPlayoffService($c->get(DatabaseService::class), $c->get(EventService::class));
});
$container->set(LeagueService::class, function (Container $c) {
    return new LeagueService(
        $c->get(DatabaseService::class),
        $c->get(EventService::class),
        $c->get(RosterService::class),
        $c->get(SeasonService::class),
        $c->get(PlayoffService::class),
        $c->get(TeamPlayoffService::class)
    );
});

// 8. Register LocationService
$container->set(LocationService::class, function (Container $c) {
    return new LocationService($c->get(DatabaseService::class));
});

// 9. Register MachineService
$container->set(MachineService::class, function (Container $c) {
    return new MachineService($c->get(DatabaseService::class));
});

// 10. Register ScoreService
$container->set(ScoreService::class, function (Container $c) {
    return new ScoreService($c->get(DatabaseService::class), $c->get(PlayoffService::class));
});

// 10b. Register TeamScoreService
$container->set(TeamScoreService::class, function (Container $c) {
    return new TeamScoreService($c->get(DatabaseService::class), $c->get(TeamPlayoffService::class));
});

// 11. Register TeamService
$container->set(TeamService::class, function (Container $c) {
    return new TeamService($c->get(DatabaseService::class));
});

// 12. Register MatchupService
$container->set(MatchupService::class, function (Container $c) {
    return new MatchupService($c->get(DatabaseService::class));
});

// 12b. Register TeamMatchupService
$container->set(TeamMatchupService::class, function (Container $c) {
    return new TeamMatchupService($c->get(DatabaseService::class));
});

// 13. Register CleanupService
$container->set(CleanupService::class, function (Container $c) {
    return new CleanupService($c->get(DatabaseService::class));
});

// 14. Register SessionService
$container->set(SessionService::class, function (Container $c) {
    return new SessionService($c->get(DatabaseService::class));
});

// Store the container in the global scope for easy access in the legacy procedural files
$GLOBALS['container'] = $container;
