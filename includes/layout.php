<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><?php echo isset($pageTitle) ? "Pinball And Stuff - Don't say \"and stuff\"" : "Pinball And Stuff"; ?></title>
  <link rel="stylesheet" id="theme-stylesheet" href="<?php echo versionedAsset($baseUrl . '/' . ($stylesDir ? $stylesDir . '/' : '') . 'styles.css'); ?>" />
  <link rel="icon" type="image/png" href="<?php echo versionedAsset($baseUrl . '/images/logo.png'); ?>" />
  <script>
    // Bridge PHP calculated base path to JavaScript
    window.APP_BASE = "<?php echo $baseUrl; ?>";
    // Bridge Engine metadata from config.php to JavaScript
    window.PB_SETTINGS = <?php echo json_encode($engineMeta, JSON_UNESCAPED_UNICODE); ?>;
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
<body class="<?php echo $bodyClass ?? ''; ?>">
  <?php include __DIR__ . '/header.php'; ?>

  <?php echo $pageContent; ?>

  <script src="<?php echo versionedAsset($baseUrl . '/js-config.php'); ?>"></script>
  <script type="module" src="<?php echo versionedAsset($baseUrl . '/scripts/main.js'); ?>"></script>
</body>
</html>