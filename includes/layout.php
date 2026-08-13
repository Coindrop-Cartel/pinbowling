<?php
$isDarkMode = isset($_COOKIE['pb_dark_mode']) && $_COOKIE['pb_dark_mode'] === 'true';
$bodyClasses = array_filter([$bodyClass ?? '', $isDarkMode ? 'dark-mode' : '']);
$bodyClassString = implode(' ', $bodyClasses);
$htmlClassString = $isDarkMode ? 'class="dark-mode"' : '';
?>
<!DOCTYPE html>
<html lang="en" <?php echo $htmlClassString; ?>>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><?php echo isset($pageTitle) ? "Pinball And Stuff - Don't say \"and stuff\"" : "Pinball And Stuff"; ?></title>
  <script>
    (function() {
      try {
        if (localStorage.getItem('pb_dark_mode') === 'true' || (document.cookie && document.cookie.indexOf('pb_dark_mode=true') !== -1)) {
          document.documentElement.classList.add('dark-mode');
        }
      } catch (e) {}
    })();
  </script>
  <link rel="stylesheet" id="theme-stylesheet" href="<?php echo versionedAsset($baseUrl . '/styles/styles.css'); ?>" />
  <link rel="icon" type="image/png" href="<?php echo versionedAsset($baseUrl . '/images/' . $active['logo']); ?>" />
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
      "@pages/": "<?php echo versionedAsset($baseUrl . '/scripts/pages/'); ?>"
    }
  }
  </script>
</head>
<body class="<?php echo $bodyClassString; ?>">
  <?php include __DIR__ . '/header.php'; ?>

  <?php echo $pageContent; ?>

  <footer class="site-footer">
    <p>&copy;2026 PinballAndStuff.com</p>
  </footer>

  <script src="<?php echo versionedAsset($baseUrl . '/js-config.php'); ?>"></script>
  <script type="module" src="<?php echo versionedAsset($baseUrl . '/scripts/main.js'); ?>"></script>
</body>
</html>