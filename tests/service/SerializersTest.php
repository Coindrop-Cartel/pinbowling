<?php
use PHPUnit\Framework\TestCase;
use App\Includes\Serializer;

/**
 * Unit tests for the Serializer class.
 */
class SerializersTest extends TestCase {

    /**
     * serializePlayer should handle the standard `user_id` column key
     * returned by most JOIN queries in PlayerService and LeagueService.
     */
    public function testSerializePlayerWithSnakeCaseUserId() {
        $row = [
            'id'           => '42',
            'player_name'  => 'Ada Lovelace',
            'ifpa_id'      => '99',
            'matchplay_id' => '12',
            'role'         => 'td',
            'username'     => 'ada',
            'email'        => 'ada@example.com',
            'user_id'      => '7',
        ];

        $result = Serializer::player($row);

        $this->assertSame(42, $result['id']);
        $this->assertSame('Ada Lovelace', $result['playerName']);
        $this->assertSame('99', $result['ifpaId']);
        $this->assertSame('12', $result['matchplayId']);
        $this->assertSame('td', $result['userRole']);
        $this->assertSame('ada', $result['username']);
        $this->assertSame('ada@example.com', $result['email']);
        $this->assertSame(7, $result['userId']);
    }

    /**
     * serializePlayer should fall back to the camelCase `userId` key
     * returned by LeagueService's player queries (which alias the column).
     */
    public function testSerializePlayerWithCamelCaseUserId() {
        $row = [
            'id'          => '10',
            'player_name' => 'Alan Turing',
            'ifpa_id'     => null,
            'userId'      => '3',
        ];

        $result = Serializer::player($row);

        $this->assertSame(10, $result['id']);
        $this->assertSame('Alan Turing', $result['playerName']);
        $this->assertNull($result['ifpaId']);
        $this->assertSame(3, $result['userId']);
    }

    /**
     * serializePlayer should produce null for userId when neither key is present
     * (e.g., a player not linked to any user account).
     */
    public function testSerializePlayerWithNoUserIdReturnsNull() {
        $row = [
            'id'          => '5',
            'player_name' => 'Grace Hopper',
        ];

        $result = Serializer::player($row);

        $this->assertSame(5, $result['id']);
        $this->assertNull($result['userId']);
        $this->assertNull($result['userRole']);
        $this->assertNull($result['username']);
        $this->assertNull($result['email']);
    }
}
