# How to Continue the Modularization

This guide shows how to complete the refactoring for the remaining service endpoints.

## Quick Template: Creating a New Service Class

### Step 1: Create the Service Class
Create `service/EntityName/EntityService.php`:

```php
<?php

namespace App\Service;

class EntityService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    // Extract all SELECT queries as public methods
    public function getAll() {
        $stmt = $this->db->getPdo()->query("SELECT * FROM entities");
        return $stmt->fetchAll();
    }

    public function getById(int $id) {
        $stmt = $this->db->query("SELECT * FROM entities WHERE id = ?", [$id]);
        return $stmt->fetch();
    }

    // Extract all INSERT/UPDATE/DELETE logic as public methods
    public function create(array $data) {
        // Validation and insert logic
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare("INSERT INTO entities (field1, field2) VALUES (?, ?)");
        $stmt->execute([$data['field1'], $data['field2']]);
        return (int)$pdo->lastInsertId();
    }

    public function update(int $id, array $data) {
        // Update logic
        return true;
    }

    public function delete(int $id) {
        // Delete logic
        return true;
    }
}
```

### Step 2: Register in Bootstrap
Add to `includes/bootstrap.php`:

```php
// Add require at the top
require_once __DIR__ . '/../service/EntityName/EntityService.php';

// Add use statement
use App\Service\EntityService;

// Add registration before "Store the container in the global scope"
$container->set(EntityService::class, function (Container $c) {
    return new EntityService($c->get(DatabaseService::class));
});
```

### Step 3: Refactor the Endpoint
Update the existing endpoint file `service/entityService.php`:

```php
<?php
/**
 * Entity Management REST API Endpoint.
 * HTTP controller that delegates to the EntityService class.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

try {
    $container = $GLOBALS['container'];
    $service = $container->get(\App\Service\EntityService::class);
    
    $method = $_SERVER['REQUEST_METHOD'];
    $input = getJsonInput();

    if ($method === 'GET') {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $data = $service->getById((int)$id);
            sendJson($data);
        } else {
            $data = $service->getAll();
            sendJson($data);
        }
    }

    if ($method === 'POST') {
        validateAdminAccess();
        $result = $service->create($input);
        sendJson(['id' => $result, 'success' => true]);
    }

    if ($method === 'PUT') {
        validateAdminAccess();
        $id = $_GET['id'] ?? null;
        if (!$id) sendJson(['error' => 'id required'], 400);
        
        $service->update((int)$id, $input);
        sendJson(['success' => true]);
    }

    if ($method === 'DELETE') {
        validateAdminAccess();
        $id = $_GET['id'] ?? null;
        if (!$id) sendJson(['error' => 'id required'], 400);
        
        $service->delete((int)$id);
        sendJson(['success' => true]);
    }

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
```

## Order of Remaining Services

### Priority 1 (High Impact)
1. **LocationService** - Used by leagues and events
2. **MachineService** - Core to scoring
3. **ScoreService** - Handles event scoring

### Priority 2 (Medium Impact)
4. **TeamService** - League team management
5. **MatchupService** - Head-to-head matchups

### Priority 3 (Low Impact)
6. **CleanupService** - Session cleanup (could be CLI command)

## Validation Checklist

For each new service, run:

```powershell
# Syntax check
php -l service/ServiceName/NameService.php
php -l service/nameService.php

# Bootstrap loads
cd c:\path\to\pinbowling
php -r "require 'includes/bootstrap.php'; echo 'OK';"

# Service available
php -r "require 'includes/bootstrap.php'; $c = $GLOBALS['container']; $c->get(\App\Service\NameService::class); echo 'OK';"
```

## Common Mistakes to Avoid

1. ❌ Don't use global $pdo in service methods - use $this->db->getPdo()
2. ❌ Don't use function_exists checks - rely on dependency injection
3. ❌ Don't mix HTTP and business logic - keep in separate files
4. ❌ Don't forget to handle transactions for multi-step operations
5. ❌ Don't forget to update bootstrap with require_once and use statements

## File Structure After Completion

```
service/
├── Auth/
│   └── AuthService.php
├── Player/
│   └── PlayerService.php
├── League/
│   └── LeagueService.php
├── Location/
│   └── LocationService.php
├── Machine/
│   └── MachineService.php
├── Score/
│   └── ScoreService.php
├── Team/
│   └── TeamService.php
├── Matchup/
│   └── MatchupService.php
├── Cleanup/
│   └── CleanupService.php
├── authService.php (refactored)
├── playerService.php (refactored)
├── leagueService.php (refactored)
├── locationService.php (to be refactored)
├── machineService.php (to be refactored)
├── scoreService.php (to be refactored)
├── teamService.php (to be refactored)
├── matchupService.php (to be refactored)
└── cleanupService.php (to be refactored)
```

## Questions?

Refer to the three completed examples:
- `service/Auth/AuthService.php` + `service/authService.php`
- `service/Player/PlayerService.php` + `service/playerService.php`
- `service/League/LeagueService.php` + `service/leagueService.php`

These show the exact pattern to follow for all remaining services.
