<?php
// Apply theme class server-side to prevent UI flicker
$preferredFormat = $_COOKIE['pb_preferred_format'] ?? 'bowling';

// Data-driven metadata lookup (mirrors JS engine properties)
$engineMeta = [
    'bowling' => [
        'logo'  => 'pinbowling.png',
    ],
    'golf' => [
        'logo'  => 'pingolf.png',
    ]
];
$activeEngineMeta = $engineMeta[$preferredFormat] ?? $engineMeta['bowling'];
$themeStyle = ($preferredFormat === 'golf') ? 'golf.css' : 'bowling.css'; // Still used for CSS file loading
$mergedBodyClass = trim(($bodyClass ?? '') . ' ' . $themeClass);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><?php echo isset($pageTitle) ? "PinBowling - $pageTitle" : 'PinBowling'; ?></title>
  <?php 
    $cssBase = $baseUrl . '/' . trim($stylesDir, '/');
    $cssBase = str_replace('//', '/', $cssBase); 
  ?>
  <link rel="stylesheet" href="<?php echo versionedAsset($cssBase . '/styles.css'); ?>" />
  <link rel="stylesheet" href="<?php echo versionedAsset($cssBase . '/' . $themeStyle); ?>" />
  <link rel="icon" type="image/png" href="<?php echo versionedAsset($baseUrl . '/images/' . $activeEngineMeta['logo']); ?>" />
  <script>
    // Bridge PHP calculated base path to JavaScript
    window.APP_BASE = "<?php echo $baseUrl; ?>";
  </script>
  <script type="importmap">
  {
    "imports": {
      "@scripts/": "<?php echo versionedAsset($baseUrl . '/scripts/'); ?>",
      "@services/": "<?php echo versionedAsset($baseUrl . '/scripts/services/'); ?>",
      "@ui/": "<?php echo versionedAsset($baseUrl . '/scripts/ui/'); ?>",
      "@core/": "<?php echo versionedAsset($baseUrl . '/scripts/core/'); ?>",
      "@pages/": "<?php echo versionedAsset($baseUrl . '/scripts/pages/'); ?>",
      "@constants/": "<?php echo $baseUrl; ?>/constants/"
    }
  }
  </script>
</head>
<body class="<?php echo $mergedBodyClass; ?>">
  <?php include __DIR__ . '/header.php'; ?>

  <?php echo $pageContent; ?>

  <script src="<?php echo versionedAsset($baseUrl . '/js-config.php'); ?>"></script>
  <script type="module" src="<?php echo versionedAsset($baseUrl . '/scripts/main.js'); ?>"></script>
</body>
</html>