<?php
/**
 * SiteContent class to handle branding and static text.
 * Separates UI metadata from system configuration.
 */
class SiteContent {
    private static array $branding = [
        'siteBrand' => 'Pinball And Stuff',
        'siteSlogan' => "Don't say \"and stuff\", just say \"There is pinball here\".",
        'heroIntroText' => "Like Pinball, but wish it was scored like Bowling? Like Pinball, but wish it was scored more like Golf? Like Pinball, but wish it was scored more 
                like Basketball? Well if it's the first two, we've got a site for you (if it's the 3rd one, find an NBA Fastbreak machine, 
                perferablely linked. I know a guy).",
        'aboutProject' => "This project is a free and open-source web application to let folks manage leagues or create one off sessions to kill time at a bar. 
                At some point the links to the source code on github will be on some other page, but I haven't gotten to that.",
        'aiDisclosure' => "I don't feel like AI \"generated\" this site, but at this point it's pretty hard to code without it being involved in some part of your workflow.  
                I don't consider that \"generating\" code because the design, structure, layout and logos were all designed and reviewed by a human (one human to be specific), 
                but I also don't want to be misleading about the fact that it was used to help generate the backend, stardized pages and track down issues and syntax.  
                <br><br>
                Unfortunately this means that some text in some locations may have been overriden and I didn't notice (but I'm working tracking that down).  
                AI has a tendancy left unchecked to overstep bounds and include dumb corporate speak when I just want it track down some syntax issue or find out why a dropdown won't go away.  
                If you have questions about how it was used, feel free to ask.  I have a complicated relationship with AI so be prepared for a long rambling answer. 
                <br><br>
                <b>If given all this you feel like it was and that makes it a hard pass for you, I totally undersatnd.</b>",
    ];

    public static function get(string $key) {
        return self::$branding[$key] ?? null;
    }

    public static function getAll(): array {
        return self::$branding;
    }
}
