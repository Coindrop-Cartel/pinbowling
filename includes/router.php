<?php
/**
 * Router class for PinBowling.
 * Handles request parsing, versioned assets, auth guards, and file mapping.
 */

class Router {
    private $baseUrl;
    private $uiVersion;
    private $baseDir;
    private $pagesDir;

    public function __construct(string $baseUrl, string $uiVersion) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->uiVersion = $uiVersion;
        $this->baseDir = dirname(__DIR__);
        $this->pagesDir = $this->baseDir . '/includes/pages';
    }

    /**
     * Resolves the current request and returns routing information.
     * 
     * @param string $path The request path.
     * @param string $query The query string.
     * @return array Information about how to handle the request.
     */
    public function resolve(string $path, string $query): array {
        // 1. Parse the request path and route relative to the script's directory
        // We use the absolute path to avoid issues with different working directories.
        $scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?: '/'));
        $baseDirName = rtrim($scriptDir, '/');
        $route = trim(substr($path, strlen($baseDirName)), '/');

        // 2. Handle Versioned Path Segments (Cache Busting)
        if (preg_match('/^v[0-9.]+\/(.*)$/', $route, $matches)) {
            $realPath = $matches[1];
            $fullPath = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $this->baseDir . '/' . $realPath);

            $ext = pathinfo($fullPath, PATHINFO_EXTENSION);
            $staticExts = ['css', 'js', 'png', 'jpg', 'jpeg', 'svg', 'ico', 'webp', 'map'];
            
            if (!file_exists($fullPath) && in_array(strtolower($ext), $staticExts)) {
                return ['type' => 'error', 'code' => 404];
            }

            if (file_exists($fullPath) && !is_dir($fullPath)) {
                if ($ext !== 'php') {
                    $mimes = [
                        'css' => 'text/css',
                        'js'  => 'application/javascript',
                        'png' => 'image/png',
                        'jpg' => 'image/jpeg',
                        'jpeg'=> 'image/jpeg',
                        'svg' => 'image/svg+xml',
                        'ico' => 'image/x-icon'
                    ];
                    return [
                        'type' => 'static',
                        'content_type' => $mimes[$ext] ?? 'application/octet-stream',
                        'file' => $fullPath
                    ];
                } else {
                    return ['type' => 'execute', 'file' => $fullPath];
                }
            }
            $route = $realPath;
        }

        // 3. Special Routing
        if ($route === 'tv') {
            $route = 'standings';
        }

        // 4. Authorization Guard
        if ($this->isManagementRoute($route)) {
            if (!$this->isAuthorized($route)) {
                return ['type' => 'redirect', 'location' => $this->baseUrl . '/', 'status' => 302];
            }
        }

        // 5. Resolve Target File
        if ($route === '') {
            return ['type' => 'default'];
        }

        if ($route === 'index' || $route === 'index.php') {
            $location = $this->baseUrl . '/';
            if (!empty($query)) {
                $location .= '?' . $query;
            }
            return ['type' => 'redirect', 'location' => $location, 'status' => 301];
        }

        $pageName = (strpos($route, '.php') === false) ? $route . '.php' : $route;
        
        $pagesFile = $this->pagesDir . '/' . $pageName;
        $serviceFile = $this->baseDir . '/' . $pageName;
        $rootFile = $this->baseDir . '/' . basename($pageName);

        if (file_exists($pagesFile)) {
            return ['type' => 'page', 'file' => $pagesFile];
        } elseif (file_exists($serviceFile)) {
            return [
                'type' => 'service',
                'file' => $serviceFile,
                'query' => $query
            ];
        } elseif (file_exists($rootFile)) {
            return ['type' => 'root', 'file' => $rootFile];
        }

        return ['type' => 'error', 'code' => 404];
    }

    private function isManagementRoute(string $route): bool {
        $checkRoute = str_replace('.php', '', $route);
        $managementRoutes = ['config', 'machines', 'teams', 'management'];
        return in_array($checkRoute, $managementRoutes);
    }

    private function isAuthorized(string $route): bool {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        $user = \App\Service\AuthService::getCurrentUser();
        if (!$user) {
            return false;
        }
        $role = $user['role'];
        $checkRoute = str_replace('.php', '', $route);
        if ($checkRoute === 'config' || $checkRoute === 'management') {
            return $role === 'admin';
        }
        return in_array($role, ['admin', 'td', 'player']);
    }
}