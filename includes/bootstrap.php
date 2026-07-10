<?php

require_once __DIR__ . '/Http/Request.php';
require_once __DIR__ . '/Http/Response.php';
require_once __DIR__ . '/Http/JsonResponse.php';
require_once __DIR__ . '/Http/RedirectResponse.php';
require_once __DIR__ . '/config.php';

// Manually require the new service classes (since we aren't using Composer autoloader for them yet)
require_once __DIR__ . '/container.php';
spl_autoload_register(function ($class) {
    if (strpos($class, 'App\\Service\\') === 0) {
        $className = str_replace('App\\Service\\', '', $class);
        $baseDir = __DIR__ . '/../service/';

        // 1. Check flat structure - mixed case (e.g. databaseService.php)
        $flatPath = $baseDir . lcfirst($className) . '.php';
        if (file_exists($flatPath)) {
            require_once $flatPath;
            return;
        }

        // 2. Check flat structure - original case (e.g. DatabaseService.php)
        $flatPath2 = $baseDir . $className . '.php';
        if (file_exists($flatPath2)) {
            require_once $flatPath2;
            return;
        }

        // 3. Check nested folder structure matching the class prefix (e.g. App\Service\AuthService -> service/Auth/AuthService.php)
        if (preg_match('/^([A-Za-z0-9]+)Service$/', $className, $matches)) {
            $folder = $matches[1];
            
            $nestedPath = $baseDir . $folder . '/' . $className . '.php';
            if (file_exists($nestedPath)) {
                require_once $nestedPath;
                return;
            }

            $nestedPath2 = $baseDir . strtolower($folder) . '/' . $className . '.php';
            if (file_exists($nestedPath2)) {
                require_once $nestedPath2;
                return;
            }
        }
    }
});

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
use App\Service\LocationService;
use App\Service\MachineService;
use App\Service\ScoreService;
use App\Service\TeamService;
use App\Service\MatchupService;
use App\Service\CleanupService;

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

// 7. Register LeagueService
$container->set(LeagueService::class, function (Container $c) {
    return new LeagueService($c->get(DatabaseService::class));
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
    return new ScoreService($c->get(DatabaseService::class));
});

// 11. Register TeamService
$container->set(TeamService::class, function (Container $c) {
    return new TeamService($c->get(DatabaseService::class));
});

// 12. Register MatchupService
$container->set(MatchupService::class, function (Container $c) {
    return new MatchupService($c->get(DatabaseService::class));
});

// 13. Register CleanupService
$container->set(CleanupService::class, function (Container $c) {
    return new CleanupService($c->get(DatabaseService::class));
});

// Store the container in the global scope for easy access in the legacy procedural files
$GLOBALS['container'] = $container;
