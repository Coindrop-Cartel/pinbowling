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
        'primaryTargetLabel' => 'Pin Baseline',
        'value1Label' => 'Strike',
        'value2Label' => '1 pin',
        'hint'  => "Enter the cumulative score after each ball. When you hit the strike score you can stop entering scores for that frame and move on to the next frame.
                    DO NOT PLAY EXTRA BALLS",
        'lastFrameHint' => "In the last frame, you can get up to 3 strikes. Keep playing until you hit the additional target scores or you run out of balls.",
        'thresholdStart' => 1, // Display ranks from 1 up to 10
        'thresholdEnd' => 10,
        'logic' => "Strokes 1, 2, or 3 are awarded based on which ball reached the Baseline Score. If the baseline is not met within three balls, 
        a score of 4-10 is assigned based on the final cumulative score relative to the strike scores for that frame and then lower bound score for 1 pin."
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
        'hint'  => "Enter the cumulative score after each ball. When you hit the target score you can stop entering scores for that round and move on to the next hole.
                    DO NOT PLAY EXTRA BALLS",
        'lastFrameHint' => "",
        'thresholdStart' => 3, // Display ranks from 3 up to 10
        'thresholdEnd' => 10,
        'logic' => "Strokes 1, 2, or 3 are awarded based on which ball reached the Target Score. If the target is not met within three balls, 
        a score of 4-10 is assigned based on the final cumulative score relative the target scores for that hole and then scored relative to the par value."
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
        'hint'  => "Each inning, two players face off head-to-head. The pitcher and batter alternate roles each inning. 
                    Enter the cumulative score after each ball. Runs are calculated based on how many threshold tiers the batter's score exceeds the pitcher's.",
        'lastFrameHint' => "",
        'thresholdStart' => 1, // Display ranks from 1 (1 run) up to 10
        'thresholdEnd' => 10,
        'logic' => "Each inning pairs two players head-to-head. Each machine takes the place of half an inning.  The scores are calucated by subtracting the
                    pitcher's score from the batter's score and then seeing if that difference met any of the run thresholds for that ball.  The same
                    run threshold can't be used more than once per inning.  If you get 1 run on ball 1, you must get 2 runs on ball 2 or 3 to get more runs.
                    At the end of the game the total runs are added up and a winnder is determined."
    ]
];

$preferredFormat = $_COOKIE['pb_preferred_format'] ?? 'bowling';
$active = $engineMeta[$preferredFormat] ?? $engineMeta['bowling'];
$bodyClass = $active['themeClass'];
