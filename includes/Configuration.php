<?php
/**
 * Configuration class to handle environment and system settings.
 * Decouples environment loading and value retrieval from the main application flow.
 */
class Configuration {
    private array $env = [];
    private static ?Configuration $instance = null;

    private function __construct(string $envPath) {
        $this->env = $this->loadEnvFile($envPath);
    }

    public static function getInstance(string $envPath = __DIR__ . '/../.env'): Configuration {
        if (self::$instance === null) {
            self::$instance = new self($envPath);
        }
        return self::$instance;
    }

    /**
     * Parses a .env file into an array and populates environment globals.
     */
    private function loadEnvFile(string $filePath): array {
        $env = [];
        if (!is_readable($filePath)) {
            return $env;
        }

        $handle = fopen($filePath, 'r');
        if ($handle === false) {
            return $env;
        }

        while (($line = fgets($handle)) !== false) {
            $line = trim($line);
            if ($line === '' || strpos(ltrim($line), '#') === 0 || strpos($line, '=') === false) {
                continue;
            }

            list($name, $value) = explode('=', $line, 2);
            $name = trim($name);
            $value = trim($value);

            if ($value !== '' && (($value[0] === '"' && substr($value, -1) === '"') || ($value[0] === "'" && substr($value, -1) === "'"))) {
                $value = substr($value, 1, -1);
            }

            $env[$name] = $value;
            putenv("$name=$value");
            $_ENV[$name] = $value;
            $_SERVER[$name] = $value;
        }

        fclose($handle);
        return $env;
    }

    /**
     * Retrieve a configuration value with fallbacks.
     */
    public function get(array $names, $default = null) {
        foreach ($names as $name) {
            if (array_key_exists($name, $this->env)) {
                return $this->env[$name];
            }
            $value = getenv($name);
            if ($value !== false) {
                return $value;
            }
        }
        return $default;
    }

    public function getDbConfig(): array {
        return [
            'host' => $this->get(['DB_HOST', 'MYSQL_HOST'], 'localhost'),
            'port' => $this->get(['DB_PORT', 'MYSQL_PORT'], '3306'),
            'name' => $this->get(['DB_NAME', 'MYSQL_DATABASE'], 'pinbowling'),
            'user' => $this->get(['DB_USER', 'MYSQL_USER'], 'username'),
            'pass' => $this->get(['DB_PASS', 'MYSQL_PASSWORD'], 'password'),
            'charset' => 'utf8mb4',
        ];
    }

    public function getApiSecret(): ?string {
        return $this->get(['API_SECRET']);
    }

    public function getAdminPassword(): string {
        return $this->get(['ADMIN_PASSWORD'], '');
    }

    /**
     * Validates that critical security settings are not using defaults.
     * @return array List of security warnings.
     */
    public function checkSecurityWarnings(): array {
        $warnings = [];
        $apiSecret = $this->getApiSecret();
        $adminPassword = $this->getAdminPassword();

        if (empty($apiSecret) || $apiSecret === 'bowl-2024-secret') {
            $warnings[] = 'API_SECRET is empty or still using the insecure default. Set a strong API_SECRET in your .env file immediately.';
        }
        if (empty($adminPassword) || $adminPassword === 'admin123') {
            $warnings[] = 'ADMIN_PASSWORD is empty or still using the insecure default. Set a strong ADMIN_PASSWORD in your .env immediately.';
        }
        return $warnings;
    }
}
