<?php
/**
 * Engine metadata definitions for Bowling, Golf, and Baseball scoring formats.
 * Determines active engine based on user cookie preference.
 */

$engineMeta = [
    'bowling' => [
        'brand' => 'PinBowling',
        'logo'  => 'pinbowling.png',
        'cta'   => "Let's Bowl!",
        'themeClass' => 'theme-bowling',
        'roundLabel' => 'Frame',
        'turnHeaderPrefix' => 'Frame',
        'primaryTargetLabel' => 'Strike',
        'value1Label' => 'Strike',
        'value2Label' => '1 pin',
        'hint'  => "Enter your score after each ball. When you hit the strike score you can stop entering scores for that frame and move on to the next frame.
                    DO NOT PLAY EXTRA BALLS",
        'lastFrameHint' => "In the last frame, you can get up to 3 strikes. Keep playing until you hit the additional target scores or you run out of balls.",
        'thresholdStart' => 1, // Display ranks from 1 up to 10
        'thresholdEnd' => 10,
        'logic' => "Target scores are assigned for values 10-1, corresponding to how many bowling pins you knock down. Achieving 10 pins on ball 1 is a strike, 
                    achieving 10 pins by the end of ball 2 is a 9/. If you haven't reached 10 pins by the end of ball 2, you get the value of your score after ball 2 
                    as your first pin total of the frame, and then on ball 3 you can achieve a spare if you get to the 10 score, or you just end up with whatever other
                    pins you manage to knock down.  Total game score uses standard bowling scores, linking spares and strikes can dramatically increase your score. "
    ],
        'golf' => [
        'brand' => 'PinGolf',
        'logo'  => 'pingolf.png',
        'cta'   => "Let's Golf!",
        'themeClass' => 'theme-golf',
        'roundLabel' => 'Hole',
        'turnHeaderPrefix' => 'Hole',
        'primaryTargetLabel' => 'Par',
        'value1Label' => 'Target Score',
        'value2Label' => 'Par',
        'hint'  => "Enter your score after each ball. When you hit the target score you can stop entering scores for that round and move on to the next hole.
                    DO NOT PLAY EXTRA BALLS",
        'lastFrameHint' => "",
        'thresholdStart' => 3, // Display ranks from 3 up to 10
        'thresholdEnd' => 10,
        'logic' => "Target Scores are assigned from 3-10, based on a target score and a par value.                      If you reach the target score on one of your balls, you get that score 
                    as your score for the hole (1, 2, 3).  If you don't reach the target score after your 3rd ball, then your score is assigned by whatever score you did 
                    reach, given the target score (4-10)."
    ],
    'baseball' => [
        'brand' => 'PinBaseball',
        'logo'  => 'pinbaseball.png',
        'cta'   => "Play Ball!",
        'themeClass' => 'theme-baseball',
        'roundLabel' => 'Inning',
        'turnHeaderPrefix' => 'Inning',
        'primaryTargetLabel' => 'Run Baseline',
        'value1Label' => 'Baseline Score',
        'value2Label' => 'Multiplier',
        'hint'  => "Enter your score after each ball.  There is no limit to how many runs you can score, so do not stop unless it's the bottom of the last inning and you have
        taken the lead.  DO NOT PLAY EXTRA BALLS",
        'lastFrameHint' => "",
        'thresholdStart' => 1, // Display ranks from 1 (1 run) up to 10
        'thresholdEnd' => 10,
        'logic' => "Player's face off head to head, with each machine representing half of a baseball inning.  Players alternate being pitcher and batter.  Scoring is 
                    calculated after each ball by subtracting the pitcher's score (Player 1) from the batter's score (Player 2), and seeing what that value equals on the run
                    scoring table.  Once a threshold is reached for a ball, the next ball must pass that total to score any more runs (if you've earned 1 run on ball 1, you
                    must hit the threshold for 2 runs on ball 2.  The difference between what has been scored so far and the value for that ball is used to determine the runs
                    for that specific ball."
    ]
];

$preferredFormat = $_COOKIE['pb_preferred_format'] ?? 'bowling';
$active = $engineMeta[$preferredFormat] ?? $engineMeta['bowling'];
$bodyClass = $active['themeClass'];
