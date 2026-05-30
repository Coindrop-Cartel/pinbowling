<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><?php echo isset($pageTitle) ? "PinBowling - $pageTitle" : 'PinBowling'; ?></title>
  <link rel="stylesheet" href="<?php echo $baseUrl; ?>/styles.css?v=<?php echo $UI_VERSION; ?>" />
  <link rel="icon" type="image/png" href="<?php echo $baseUrl; ?>/images/logo.png?v=<?php echo $UI_VERSION; ?>" />
  <script>
    // Bridge PHP calculated base path to JavaScript
    window.APP_BASE = "<?php echo $baseUrl; ?>";
  </script>
  <script type="importmap">
  {
    "imports": {
      "@scripts/": "<?php echo $baseUrl; ?>/scripts/",
      "@services/": "<?php echo $baseUrl; ?>/scripts/services/",
      "@ui/": "<?php echo $baseUrl; ?>/scripts/ui/",
      "@core/": "<?php echo $baseUrl; ?>/scripts/core/",
      "@pages/": "<?php echo $baseUrl; ?>/scripts/pages/",
      "@constants/": "<?php echo $baseUrl; ?>/constants/"
    }
  }
  </script>
</head>
<body class="<?php echo $bodyClass ?? ''; ?>">
  <?php include __DIR__ . '/header.php'; ?>

  <?php echo $pageContent; ?>

  <script src="<?php echo $baseUrl; ?>/js-config.php?v=<?php echo $UI_VERSION; ?>"></script>
  <script type="module" src="<?php echo $baseUrl; ?>/scripts/main.js?v=<?php echo $UI_VERSION; ?>"></script>
</body>
</html>