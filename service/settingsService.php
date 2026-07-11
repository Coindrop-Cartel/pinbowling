<?php

namespace App\Service;

/**
 * Service to manage application-wide configuration and runtime settings.
 */
class SettingsService {
    private array $settings;

    /**
     * SettingsService constructor.
     *
     * @param array $settings Initial configuration settings key-value map.
     */
    public function __construct(array $settings) {
        $this->settings = $settings;
    }

    /**
     * Retrieve a specific configuration setting by its key, falling back to a default value.
     *
     * @param string $key The configuration key to look up.
     * @param mixed $default The default value to return if key is not set.
     * @return mixed The configured setting value or the default fallback.
     */
    public function get(string $key, $default = null) {
        return $this->settings[$key] ?? $default;
    }
}
