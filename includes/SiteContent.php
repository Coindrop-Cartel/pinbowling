<?php
/**
 * SiteContent class to handle branding and static text.
 * Separates UI metadata from system configuration.
 */
class SiteContent {
    private static array $branding = [
        'mainSiteLogo' => 'main-site-logo-header.png',
        'siteBrand' => 'Pinball And Stuff',
        'siteSlogan' => "Don't say \"and stuff\", just say \"There is pinball here\".",
        'heroIntroText' => "Like Pinball, but wish it was scored like Bowling? Like Pinball, but wish it was scored more like Golf? Like Pinball, but wish it was scored more 
                like Basketball? Well if it's the first two, we've got a site for you (if it's the 3rd one, find an NBA Fastbreak machine, 
                perferablely linked. I know a guy).",
        'aiDisclosure' => "AI was used in the development of this site.  The design, structure, layout, logos and rules were all designed by a human (one human to be specific),
                but I also don't want to be misleading about the fact that it was used to help generate backend code, remove duplicate code blocks and track down issues.  
        <br><br>
        <b>If given all this it makes it a hard pass for you, I totally understand.</b>",
    ];

    /**
     * Retrieve a specific site content string or branding metadata by key.
     *
     * @param string $key The branding key to retrieve.
     * @return string|null The content string, or null if key does not exist.
     */
    public static function get(string $key) {
        return self::$branding[$key] ?? null;
    }

    /**
     * Retrieve all site content and branding settings.
     *
     * @return array Entire key-value map of site branding metadata.
     */
    public static function getAll(): array {
        return self::$branding;
    }
}
