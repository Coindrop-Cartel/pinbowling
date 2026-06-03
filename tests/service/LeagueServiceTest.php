<?php
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for League Service logic.
 * Verifies data transformation and camelCase mapping.
 */
class LeagueServiceTest extends TestCase {
    
    protected function setUp(): void {
        // Satisfy the API Secret check for includes/config.php
        $_SERVER['HTTP_X_PB_SECRET'] = 'bowl-2024-secret';
        
        // Include the service to access its functions
        require_once __DIR__ . '/../../service/leagueService.php';
    }

    public function testSerializeEventMapsSnakeCaseToCamelCase() {
        $dbRow = [
            'id' => '10',
            'league_id' => '5',
            'location_id' => '1',
            'event_name' => 'Finals',
            'event_date' => '2024-12-01',
            'location_name' => 'The Silver Ballroom',
            'scoring_format' => 'classic'
        ];

        $result = serializeEvent($dbRow);

        $this->assertEquals(10, $result['id']);
        $this->assertEquals(5, $result['leagueId']);
        $this->assertEquals('Finals', $result['eventName']);
        $this->assertEquals('classic', $result['scoringFormat']);
        $this->assertArrayHasKey('locationName', $result);
    }

    public function testSerializeLeagueHandlesMissingEvents() {
        $dbRow = [
            'id' => 1,
            'name' => 'Empty League',
            'type' => 'standard',
            'start_date' => '2024-01-01',
            'scoring_format' => 'bowling'
        ];

        $result = serializeLeague($dbRow);

        $this->assertEquals('Empty League', $result['name']);
        $this->assertIsArray($result['events']);
        $this->assertEmpty($result['events']);
    }
}
