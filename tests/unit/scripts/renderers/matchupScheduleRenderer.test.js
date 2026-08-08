/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { renderMatchupSchedule } from '../../../../scripts/renderers/matchupScheduleRenderer.js';

describe('renderMatchupSchedule - Playoff Alternating Home/Away Series', () => {
  it('correctly tracks series wins when home and away alternate between games', () => {
    const container = document.createElement('ul');
    const event = {
      isTeam: true,
      playoffSeriesLength: 3,
      eventName: 'Playoffs: Finals',
      matchups: [
        {
          id: 1,
          eventId: 10,
          seriesId: 1,
          gameNumber: 1,
          team1Id: 101,
          team1Name: 'Pin Pals',
          team2Id: 102,
          team2Name: 'The Holy Rollers',
          team1Score: 1,
          team2Score: 5,
          teamWinnerId: 102,
          status: 'completed'
        },
        {
          id: 2,
          eventId: 10,
          seriesId: 1,
          gameNumber: 2,
          team1Id: 102,
          team1Name: 'The Holy Rollers',
          team2Id: 101,
          team2Name: 'Pin Pals',
          team1Score: 5,
          team2Score: 8,
          teamWinnerId: 101,
          status: 'completed'
        }
      ]
    };

    renderMatchupSchedule(container, event, {
      onPlayMatchup: () => {},
      isAdmin: false
    });

    const html = container.innerHTML;
    // Should show tied 1-1 series header badge, NOT series won by Holy Rollers 2-0
    expect(html).toContain('Pin Pals (1) vs The Holy Rollers (1)');
    expect(html).not.toContain('won series');
    expect(html).not.toContain('Not Needed');
  });

  it('correctly displays series winner for best-of-1 series when league is passed in options', () => {
    const container = document.createElement('ul');
    const league = {
      id: 1,
      playoffSeriesLength: 1
    };
    const event = {
      isTeam: true,
      eventName: 'Playoffs: Finals',
      matchups: [
        {
          id: 1,
          eventId: 10,
          seriesId: 1,
          gameNumber: 1,
          team1Id: 101,
          team1Name: 'Pin Pals',
          team2Id: 102,
          team2Name: 'The Holy Rollers',
          team1Score: 2,
          team2Score: 4,
          teamWinnerId: 102,
          status: 'completed'
        }
      ]
    };

    renderMatchupSchedule(container, event, {
      league,
      onPlayMatchup: () => {},
      isAdmin: false
    });

    const html = container.innerHTML;
    expect(html).toContain('✓ The Holy Rollers won series');
  });
});
