<?php

require_once '/var/www/html/config/config.inc.php';

$domain = getenv('PS_DOMAIN') ?: 'localhost:8080';

Configuration::updateValue('PS_SHOP_NAME', getenv('PS_SHOP_NAME') ?: 'AnimeShop');
Configuration::updateValue('PS_REWRITING_SETTINGS', 1);
Configuration::updateValue('PS_USE_HTMLPURIFIER', 1);
Configuration::updateValue('PS_CANONICAL_REDIRECT', 0);

$shopUrl = new ShopUrl(1);
if (Validate::isLoadedObject($shopUrl)) {
    $shopUrl->domain = $domain;
    $shopUrl->domain_ssl = $domain;
    $shopUrl->physical_uri = '/';
    $shopUrl->save();
}

$extraDomains = array_filter(array_map('trim', explode(',', getenv('PS_EXTRA_DOMAINS') ?: 'app')));
foreach ($extraDomains as $extraDomain) {
    if ($extraDomain === $domain) {
        continue;
    }

    $exists = (bool) Db::getInstance()->getValue(
        'SELECT id_shop_url FROM ' . _DB_PREFIX_ . 'shop_url WHERE domain = "' . pSQL($extraDomain) . '" AND physical_uri = "/"'
    );
    if (!$exists) {
        $aliasUrl = new ShopUrl();
        $aliasUrl->id_shop = 1;
        $aliasUrl->domain = $extraDomain;
        $aliasUrl->domain_ssl = $extraDomain;
        $aliasUrl->physical_uri = '/';
        $aliasUrl->virtual_uri = '';
        $aliasUrl->main = 0;
        $aliasUrl->active = 1;
        $aliasUrl->add();
    }
}

$modulesToEnable = array_values(array_unique(array_filter(array_map('trim', array_merge(
    [
        'blockwishlist',
        'ps_contactinfo',
        'ps_sharebuttons',
        'ps_socialfollow',
        'ps_categorytree',
        'ps_featuredproducts',
        'ps_searchbar',
    ],
	    explode(',', getenv('SHOP_EXTRA_MODULES') ?: '')
	)))));
	
$modulesReady = 0;
$moduleErrors = 0;
foreach ($modulesToEnable as $moduleName) {
    $module = Module::getInstanceByName($moduleName);
    if (!$module) {
        $moduleErrors++;
        continue;
    }

    try {
        if (!Module::isInstalled($moduleName) && !$module->install()) {
            $moduleErrors++;
            continue;
        }
        if (!Module::isEnabled($moduleName) && !$module->enable()) {
            $moduleErrors++;
            continue;
        }

        $modulesReady++;
    } catch (Throwable $exception) {
        $moduleErrors++;
    }
}
echo "[shop] modules ready: {$modulesReady}\n";
if ($moduleErrors > 0) {
    echo "[shop] modules skipped: {$moduleErrors}\n";
}

$customer = new Customer();
if ($customer->getByEmail('pub@prestashop.com')) {
    $customer->passwd = Tools::hash('123456789');
    $customer->active = 1;
    $customer->update();
}

$assistantEmail = getenv('SHOP_CUSTOMER_EMAIL') ?: 'assistant@anishop.local';
$assistantPassword = getenv('SHOP_CUSTOMER_PASSWORD') ?: 'assistant_demo';
$customerGroupId = (int) Configuration::get('PS_CUSTOMER_GROUP');
$languageId = (int) Configuration::get('PS_LANG_DEFAULT');
$shopId = (int) Context::getContext()->shop->id;
$shopGroupId = (int) Context::getContext()->shop->id_shop_group;

$assistant = new Customer();
if ($assistant->getByEmail($assistantEmail)) {
    $assistant->firstname = 'Assistant';
    $assistant->lastname = 'User';
    $assistant->passwd = Tools::hash($assistantPassword);
    $assistant->active = 1;
    $assistant->deleted = 0;
    $assistant->is_guest = 0;
    $assistant->id_default_group = $customerGroupId;
    $assistant->id_lang = $languageId;
    $assistant->id_shop = $shopId;
    $assistant->id_shop_group = $shopGroupId;
    $assistant->update();
    $assistant->updateGroup([$customerGroupId]);
} else {
    $assistant->firstname = 'Assistant';
    $assistant->lastname = 'User';
    $assistant->email = $assistantEmail;
    $assistant->passwd = Tools::hash($assistantPassword);
    $assistant->active = 1;
    $assistant->deleted = 0;
    $assistant->is_guest = 0;
    $assistant->id_default_group = $customerGroupId;
    $assistant->id_lang = $languageId;
    $assistant->id_shop = $shopId;
    $assistant->id_shop_group = $shopGroupId;
$assistant->groupBox = [$customerGroupId];
    $assistant->add();
}

$languages = Language::getLanguages(false);
$languageIds = array_map(static function (array $language): int {
    return (int) $language['id_lang'];
}, $languages);
$assetRoot = __DIR__ . '/anime-assets';

$translatable = static function (string $value) use ($languageIds): array {
    $values = [];
    foreach ($languageIds as $languageId) {
        $values[$languageId] = $value;
    }

    return $values;
};

$copyAsset = static function (string $source, string $destination): bool {
    if (!is_file($source)) {
        return false;
    }

    $directory = dirname($destination);
    if (!is_dir($directory)) {
        mkdir($directory, 0775, true);
    }

    return copy($source, $destination);
};

$refreshCategoryImage = static function (int $categoryId, string $sourcePath): void {
    if (!is_file($sourcePath)) {
        return;
    }

    $basePath = _PS_CAT_IMG_DIR_ . $categoryId . '.jpg';
    @unlink($basePath);

    foreach (ImageType::getImagesTypes('categories') as $imageType) {
        @unlink(_PS_CAT_IMG_DIR_ . $categoryId . '-' . stripslashes($imageType['name']) . '.jpg');
    }

    if (!ImageManager::resize($sourcePath, $basePath, null, null, 'jpg')) {
        return;
    }

    foreach (ImageType::getImagesTypes('categories') as $imageType) {
        ImageManager::resize(
            $basePath,
            _PS_CAT_IMG_DIR_ . $categoryId . '-' . stripslashes($imageType['name']) . '.jpg',
            (int) $imageType['width'],
            (int) $imageType['height'],
            'jpg'
        );
    }
};

$refreshProductCoverImage = static function (int $productId, string $sourcePath, string $legend) use ($translatable): void {
    if (!is_file($sourcePath)) {
        return;
    }

    $cover = Image::getCover($productId);
    $imageId = is_array($cover) && isset($cover['id_image']) ? (int) $cover['id_image'] : 0;
    if ($imageId <= 0) {
        return;
    }

    $image = new Image($imageId);
    if (!Validate::isLoadedObject($image)) {
        return;
    }

    $path = $image->getPathForCreation();
    if (!$path) {
        return;
    }

    @unlink($path . '.jpg');
    foreach (ImageType::getImagesTypes('products') as $imageType) {
        @unlink($path . '-' . stripslashes($imageType['name']) . '.jpg');
    }

    if (!ImageManager::resize($sourcePath, $path . '.jpg', null, null, 'jpg')) {
        return;
    }

    foreach (ImageType::getImagesTypes('products') as $imageType) {
        ImageManager::resize(
            $path . '.jpg',
            $path . '-' . stripslashes($imageType['name']) . '.jpg',
            (int) $imageType['width'],
            (int) $imageType['height'],
            'jpg'
        );
    }

    $image->legend = $translatable($legend);
    $image->save();
};

$replaceBranding = static function () use ($assetRoot, $copyAsset): void {
    $logoPath = $assetRoot . '/branding/logo.png';
    $logoMailPath = $assetRoot . '/branding/logo-mail.jpg';
    $logoInvoicePath = $assetRoot . '/branding/logo-invoice.jpg';
    $faviconPath = $assetRoot . '/branding/favicon.ico';

    if ($copyAsset($logoPath, _PS_IMG_DIR_ . 'logo.png')) {
        Configuration::updateValue('PS_LOGO', 'logo.png');
        [$width, $height] = getimagesize(_PS_IMG_DIR_ . 'logo.png');
        Configuration::updateValue('SHOP_LOGO_WIDTH', (int) round($width));
        Configuration::updateValue('SHOP_LOGO_HEIGHT', (int) round($height));
    }

    if ($copyAsset($logoMailPath, _PS_IMG_DIR_ . 'logo-mail.jpg')) {
        Configuration::updateValue('PS_LOGO_MAIL', 'logo-mail.jpg');
    }

    if ($copyAsset($logoInvoicePath, _PS_IMG_DIR_ . 'logo-invoice.jpg')) {
        Configuration::updateValue('PS_LOGO_INVOICE', 'logo-invoice.jpg');
    }

    if ($copyAsset($faviconPath, _PS_IMG_DIR_ . 'favicon.ico')) {
        Configuration::updateValue('PS_FAVICON', 'favicon.ico');
    }
};

$replaceBranding();

// Keep the Classic theme layout, but repurpose the catalog and navigation.
$categoryCatalog = [
    3 => [
        'name' => 'Figures',
        'slug' => 'figures',
        'description' => 'Scale figures, prize figures and shelf-ready collectibles.',
        'image' => $assetRoot . '/categories/figures.jpg',
        'position' => 0,
    ],
    4 => [
        'name' => 'Manga',
        'slug' => 'manga',
        'description' => 'Illustrated volumes, art prints and desk-ready manga picks.',
        'image' => $assetRoot . '/categories/manga.jpg',
        'position' => 1,
    ],
    5 => [
        'name' => 'Gacha',
        'slug' => 'gacha',
        'description' => 'Capsule collectibles and low-price anime shelf drops.',
        'image' => $assetRoot . '/categories/gacha.jpg',
        'position' => 2,
    ],
    6 => [
        'name' => 'Gunpla',
        'slug' => 'gunpla',
        'description' => 'Model kits, build gear and display-ready mecha pieces.',
        'image' => $assetRoot . '/categories/gunpla.jpg',
        'position' => 3,
    ],
    7 => [
        'name' => 'Home & Stationery',
        'slug' => 'home-stationery',
        'description' => 'Notebooks, mugs and desk goods with anime shelf energy.',
        'image' => $assetRoot . '/categories/stationery.png',
        'position' => 4,
    ],
    8 => [
        'name' => 'Plushies',
        'slug' => 'plushies',
        'description' => 'Soft character plush, pillows and collector room comfort.',
        'image' => $assetRoot . '/categories/plushies.jpg',
        'position' => 5,
    ],
    9 => [
        'name' => 'Blind Boxes',
        'slug' => 'blind-boxes',
        'description' => 'Sealed mystery drops for plush, mini figures and anime collectibles.',
        'image' => $assetRoot . '/categories/blind-boxes.jpg',
        'position' => 6,
    ],
];

foreach ($categoryCatalog as $categoryId => $categoryData) {
    $category = new Category($categoryId);
    if (!Validate::isLoadedObject($category)) {
        continue;
    }

    $category->id_parent = 2;
    $category->active = 1;
    $category->name = $translatable($categoryData['name']);
    $category->link_rewrite = $translatable($categoryData['slug']);
    $category->description = $translatable($categoryData['description']);
    $category->meta_title = $translatable($categoryData['name']);
    $category->meta_description = $translatable($categoryData['description']);
    $category->save();

    Db::getInstance()->update(
        'category_shop',
        ['position' => (int) $categoryData['position']],
        'id_category = ' . (int) $categoryId . ' AND id_shop = ' . (int) $shopId
    );

    $refreshCategoryImage($categoryId, $categoryData['image']);
}

Category::regenerateEntireNtree();
$rootCategory = new Category(1);
if (Validate::isLoadedObject($rootCategory)) {
    $rootCategory->recalculateLevelDepth(1);
}

Configuration::updateValue('MOD_BLOCKTOPMENU_ITEMS', 'CAT3,CAT4,CAT5,CAT6,CAT7,CAT8,CAT9');

$productCatalog = [
    1 => [
        'name' => 'Jujutsu Kaisen Gacha - 4',
        'slug' => 'jujutsu-kaisen-gacha-4',
        'price' => 6.00,
        'summary' => 'Compact capsule collectible from the Jujutsu Kaisen line.',
        'description' => '<p>Small anime gacha pull designed for shelf styling, desk displays and collector bundles.</p>',
        'categories' => [2, 5],
        'default_category' => 5,
        'image' => $assetRoot . '/products/jujutsu-gacha.jpg',
    ],
    2 => [
        'name' => 'Acrylic Display Box Front-Open for Collectibles Action Figures Toys 20*20*25cm',
        'slug' => 'acrylic-display-box-front-open-for-collectibles-action-figures-toys-20-20-25cm',
        'price' => 7.95,
        'summary' => 'Front-open acrylic display box for anime figures and desk collectibles.',
        'description' => '<p>Transparent front-open acrylic case sized for prize figures, mini displays and blind-box pulls.</p>',
        'categories' => [2, 3, 9],
        'default_category' => 3,
        'image' => $assetRoot . '/products/acrylic-box-front.jpg',
    ],
    3 => [
        'name' => 'Hatsune Miku Rainy Day Plush Blind Box',
        'slug' => 'hatsune-miku-rainy-day-plush-blind-box',
        'price' => 19.99,
        'summary' => 'Rainy Day plush blind box with soft collector-room styling.',
        'description' => '<p>Blind-box plush drop with a soft finish, display-ready color palette and strong anime shop shelf presence.</p>',
        'categories' => [2, 8, 9],
        'default_category' => 9,
        'image' => $assetRoot . '/products/hatsune-miku.jpg',
    ],
    4 => [
        'name' => 'Junji Ito Doll Plush Series - NullSET',
        'slug' => 'junji-ito-doll-plush-series-nullset',
        'price' => 14.99,
        'summary' => 'Collector plush series with horror manga energy and shelf-ready detail.',
        'description' => '<p>Compact plush collectible inspired by horror manga aesthetics and designed for anime shelf setups.</p>',
        'categories' => [2, 8, 9],
        'default_category' => 8,
        'image' => $assetRoot . '/products/junji-ito.jpg',
    ],
    5 => [
        'name' => 'Jujutsu Kaisen Vol. 21 Manga',
        'slug' => 'jujutsu-kaisen-vol-21-manga',
        'price' => 10.90,
        'summary' => 'Shelf-ready manga volume for shonen collectors.',
        'description' => '<p>Collector-facing manga volume with strong display appeal for reading corners, desk shelves and anime gift bundles.</p>',
        'categories' => [2, 4],
        'default_category' => 4,
        'image' => $assetRoot . '/categories/manga.jpg',
    ],
    6 => [
        'name' => 'Gunpla Starter Model Kit Display',
        'slug' => 'gunpla-starter-model-kit-display',
        'price' => 17.90,
        'summary' => 'Entry-level gunpla display piece for builders and shelf setups.',
        'description' => '<p>Gunpla-focused display piece with clean panel lines and a collector-friendly footprint for anime desks.</p>',
        'categories' => [2, 6],
        'default_category' => 6,
        'image' => $assetRoot . '/products/gunpla.jpg',
    ],
    7 => [
        'name' => 'Figure Display Box 25cm',
        'slug' => 'figure-display-box-25cm',
        'price' => 9.90,
        'summary' => 'Display box sized for anime figures, acrylic stands and gacha sets.',
        'description' => '<p>Compact figure display box that helps collectors keep prize figures and small acrylic pieces dust-free.</p>',
        'categories' => [2, 3, 9],
        'default_category' => 3,
        'image' => $assetRoot . '/products/acrylic-box-side.jpg',
    ],
    8 => [
        'name' => 'Anime Acrylic Keychain Mystery Pack',
        'slug' => 'anime-acrylic-keychain-mystery-pack',
        'price' => 12.50,
        'summary' => 'Mystery acrylic accessory pack for anime bags, shelves and key sets.',
        'description' => '<p>Accessory mystery pack built for collectors who want small, giftable anime items with strong display value.</p>',
        'categories' => [2, 7, 9],
        'default_category' => 9,
        'image' => $assetRoot . '/products/acrylic-box-front.jpg',
    ],
    9 => [
        'name' => 'Rainy Day Character Cushion',
        'slug' => 'rainy-day-character-cushion',
        'price' => 18.90,
        'summary' => 'Soft character cushion for collector corners and anime rooms.',
        'description' => '<p>Plush-style anime room cushion made for shelf corners, sofas and compact collector setups.</p>',
        'categories' => [2, 7, 8],
        'default_category' => 8,
        'image' => $assetRoot . '/products/hatsune-miku.jpg',
    ],
    10 => [
        'name' => 'Collector Plush Cushion',
        'slug' => 'collector-plush-cushion',
        'price' => 18.90,
        'summary' => 'Display-friendly cushion with soft plush styling.',
        'description' => '<p>Soft plush cushion that fits anime room styling while keeping the default PrestaShop catalog structure intact.</p>',
        'categories' => [2, 7, 8],
        'default_category' => 8,
        'image' => $assetRoot . '/products/junji-ito.jpg',
    ],
    11 => [
        'name' => 'Shelf Companion Pillow',
        'slug' => 'shelf-companion-pillow',
        'price' => 22.50,
        'summary' => 'Anime room pillow for plush-focused collector spaces.',
        'description' => '<p>Room accessory pillow meant to round out plush shelves, reading corners and anime display walls.</p>',
        'categories' => [2, 7, 8],
        'default_category' => 8,
        'image' => $assetRoot . '/categories/figures.jpg',
    ],
    12 => [
        'name' => 'Manga Art Print - Jujutsu Shelf',
        'slug' => 'manga-art-print-jujutsu-shelf',
        'price' => 12.90,
        'summary' => 'Anime print for manga corners, shelves and framed desk setups.',
        'description' => '<p>Illustrated manga print designed to pair with shelves, figure displays and anime reading spaces.</p>',
        'categories' => [2, 4],
        'default_category' => 4,
        'image' => $assetRoot . '/categories/manga.jpg',
    ],
    13 => [
        'name' => 'Figure Shelf Poster Set',
        'slug' => 'figure-shelf-poster-set',
        'price' => 14.50,
        'summary' => 'Poster set made to frame figure shelves and anime desks.',
        'description' => '<p>Poster duo with a collector-shop feel, built for backdrops behind prize figures and manga stacks.</p>',
        'categories' => [2, 3, 4],
        'default_category' => 3,
        'image' => $assetRoot . '/categories/figures.jpg',
    ],
    14 => [
        'name' => 'Character Illustration Print',
        'slug' => 'character-illustration-print',
        'price' => 11.90,
        'summary' => 'Illustration print sized for anime desk displays and gift bundles.',
        'description' => '<p>Character print with a clean collector-shop look for anime wall grids and desk decor.</p>',
        'categories' => [2, 4, 9],
        'default_category' => 4,
        'image' => $assetRoot . '/homepage/slide-1.png',
    ],
    15 => [
        'name' => 'Collector Starter Bundle',
        'slug' => 'collector-starter-bundle',
        'price' => 35.00,
        'summary' => 'Starter bundle for new figure, blind-box and desk-display collectors.',
        'description' => '<p>Mixed collector bundle that combines display-ready styling with entry-level anime shop essentials.</p>',
        'categories' => [2, 3, 9],
        'default_category' => 9,
        'image' => $assetRoot . '/products/acrylic-box-side.jpg',
    ],
    16 => [
        'name' => 'Spiral Horror Notebook',
        'slug' => 'spiral-horror-notebook',
        'price' => 12.90,
        'summary' => 'Desk notebook with manga-horror energy for anime collectors.',
        'description' => '<p>Soft-cover notebook designed for journaling, sketching and build notes in anime-inspired workspaces.</p>',
        'categories' => [2, 7],
        'default_category' => 7,
        'image' => $assetRoot . '/categories/stationery.png',
    ],
    17 => [
        'name' => 'Rainy Day Notebook',
        'slug' => 'rainy-day-notebook',
        'price' => 12.90,
        'summary' => 'Collector desk notebook with a soft pastel anime palette.',
        'description' => '<p>Compact desk notebook for anime-inspired workspaces, collector lists and shelf planning.</p>',
        'categories' => [2, 7],
        'default_category' => 7,
        'image' => $assetRoot . '/categories/stationery.png',
    ],
    18 => [
        'name' => 'Gunpla Build Log Notebook',
        'slug' => 'gunpla-build-log-notebook',
        'price' => 12.90,
        'summary' => 'Build log notebook for gunpla notes, loadouts and display plans.',
        'description' => '<p>Notebook for gunpla builders who track paint ideas, builds and collector display layouts.</p>',
        'categories' => [2, 6, 7],
        'default_category' => 6,
        'image' => $assetRoot . '/products/gunpla.jpg',
    ],
    19 => [
        'name' => 'Customizable Collector Mug',
        'slug' => 'customizable-collector-mug',
        'price' => 13.90,
        'summary' => 'Simple collector mug for anime desks and reading corners.',
        'description' => '<p>Desk-ready mug that rounds out anime reading setups, shelf corners and stationery bundles.</p>',
        'categories' => [2, 7],
        'default_category' => 7,
        'image' => $assetRoot . '/categories/stationery.png',
    ],
];

foreach ($productCatalog as $productId => $productData) {
    $product = new Product($productId);
    if (!Validate::isLoadedObject($product)) {
        continue;
    }

    $product->active = 1;
    $product->id_category_default = (int) $productData['default_category'];
    $product->name = $translatable($productData['name']);
    $product->link_rewrite = $translatable($productData['slug']);
    $product->description_short = $translatable('<p>' . $productData['summary'] . '</p>');
    $product->description = $translatable($productData['description']);
    $product->meta_title = $translatable($productData['name']);
    $product->meta_description = $translatable($productData['summary']);
    $product->available_now = $translatable('In stock');
    $product->available_later = $translatable('Restocking soon');
    $product->price = (float) $productData['price'];
    $product->save();
    $product->updateCategories($productData['categories']);

    $refreshProductCoverImage($productId, $productData['image'], $productData['name']);
}

$link = Context::getContext()->link ?: new Link();
$sliderDirectory = _PS_ROOT_DIR_ . '/modules/ps_imageslider/images/';
$slides = [
    1 => [
        'asset' => $assetRoot . '/homepage/slide-1.png',
        'title' => 'AnimeShop',
        'legend' => 'anime-shop-hero',
        'url' => $link->getCategoryLink(3),
        'description' => '<h2>We know why you love anime</h2><p>Figures, manga, plushies and collector-room pieces selected for a real anime shop feel.</p>',
    ],
    2 => [
        'asset' => $assetRoot . '/homepage/slide-2.jpg',
        'title' => 'Figures & Collectibles',
        'legend' => 'figures-and-collectibles',
        'url' => $link->getCategoryLink(3),
        'description' => '<h2>Figures and display essentials</h2><p>Prize figures, acrylic cases and shelf-ready pieces for anime collectors.</p>',
    ],
    3 => [
        'asset' => $assetRoot . '/homepage/slide-3.jpg',
        'title' => 'Manga & Desk Goods',
        'legend' => 'manga-and-desk-goods',
        'url' => $link->getCategoryLink(7),
        'description' => '<h2>Manga, gunpla and stationery</h2><p>Build logs, notebooks and illustrated volumes for anime desks and reading corners.</p>',
    ],
];

if (is_dir($sliderDirectory)) {
    foreach ($slides as $slideId => $slideData) {
        $extension = strtolower((string) pathinfo($slideData['asset'], PATHINFO_EXTENSION));
        $fileName = 'anime-slide-' . $slideId . '.' . $extension;
        $rtlFileName = 'anime-slide-' . $slideId . '_rtl.' . $extension;

        $copyAsset($slideData['asset'], $sliderDirectory . $fileName);
        $copyAsset($slideData['asset'], $sliderDirectory . $rtlFileName);

        Db::getInstance()->update(
            'homeslider_slides',
            [
                'active' => 1,
                'position' => (int) $slideId,
            ],
            'id_homeslider_slides = ' . (int) $slideId
        );

        foreach ($languageIds as $languageId) {
            Db::getInstance()->execute(
                'UPDATE `' . _DB_PREFIX_ . 'homeslider_slides_lang`
                SET `title` = "' . pSQL($slideData['title']) . '",
                    `description` = "' . pSQL($slideData['description'], true) . '",
                    `legend` = "' . pSQL($slideData['legend']) . '",
                    `url` = "' . pSQL($slideData['url']) . '",
                    `image` = "' . pSQL($fileName) . '"
                WHERE `id_homeslider_slides` = ' . (int) $slideId . ' AND `id_lang` = ' . (int) $languageId
            );
        }
    }
}

$bannerDirectory = _PS_ROOT_DIR_ . '/modules/ps_banner/img/';
$bannerFileName = 'anime-banner.jpg';
if (is_dir($bannerDirectory) && $copyAsset($assetRoot . '/homepage/banner.jpg', $bannerDirectory . $bannerFileName)) {
    $bannerImages = [];
    $bannerLinks = [];
    $bannerDescriptions = [];

    foreach ($languageIds as $languageId) {
        $bannerImages[$languageId] = $bannerFileName;
        $bannerLinks[$languageId] = $link->getCategoryLink(3);
        $bannerDescriptions[$languageId] = 'Figures, manga, plushies and gunpla selected for anime shelves.';
    }

    Configuration::updateValue('BANNER_IMG', $bannerImages);
    Configuration::updateValue('BANNER_LINK', $bannerLinks);
    Configuration::updateValue('BANNER_DESC', $bannerDescriptions);
}

if (is_dir(_PS_ROOT_DIR_ . '/var/cache')) {
    Tools::deleteDirectory(_PS_ROOT_DIR_ . '/var/cache', false);
}

echo "[shop] setup complete\n";
