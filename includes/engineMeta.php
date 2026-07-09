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
        'value1Label' => 'Baseline Score',
        'value2Label' => 'Multiplier',
        'hint'  => "Enter the cumulative score after each ball. When you hit the baseline score you can stop entering scores for that frame and move on to the next frame.
                    DO NOT ROLL EXTRA BALLS",
        'lastFrameHint' => "",
        'thresholdStart' => 1, // Display ranks from 1 up to 10
        'thresholdEnd' => 10,
        'logic' => "Strokes 1, 2, or 3 are awarded based on which ball reached the Baseline Score. If the baseline is not met within three balls, 
        a score of 4-10 is assigned based on the final cumulative score relative to the baseline scores for that frame and then scored relative to the multiplier value (-1, +2, etc).  
        If you don't know how Bowling scoring works, I don't really know what to tell you, but I will say higher is better."
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
        a score of 4-10 is assigned based on the final cumulative score relative the target scores for that hole and then scored relative to the par value (-1, +2, etc).  
        If you don't know how Golf scoring works, I don't really know what to tell you, but I will say lower is better."
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
        'logic' => "Each inning pairs two players head-to-head. The batter scores runs by exceeding the pitcher's score across threshold tiers. 
        Odd innings: Player 1 is the pitcher, Player 2 is the batter. Even innings: roles swap. 
        The batter's runs per ball are determined by how many exponential tiers their score surpasses. Total runs = sum of best runs across 3 balls. 
        If you don't know how Baseball scoring works, just know that more runs is better."
    ]
];

$preferredFormat = $_COOKIE['pb_preferred_format'] ?? 'bowling';
$active = $engineMeta[$preferredFormat] ?? $engineMeta['bowling'];
$bodyClass = $active['themeClass'];
