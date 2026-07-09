<?php

namespace App\Service;

class SettingsService {
    private array $settings;

    public function __construct(array $settings) {
        $this->settings = $settings;
    }

    public function get(string $key, $default = null) {
        return $this->settings[$key] ?? $default;
    }
}
