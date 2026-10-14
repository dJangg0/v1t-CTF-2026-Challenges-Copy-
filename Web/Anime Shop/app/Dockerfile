FROM ubuntu:24.04 AS app-builder

ARG NODE_VERSION=20.19.5
ARG PRESTASHOP_VERSION=9.1.4
ARG PRESTASHOP_ARCHIVE_URL=https://github.com/PrestaShop/PrestaShop/archive/refs/tags/${PRESTASHOP_VERSION}.zip

ENV DEBIAN_FRONTEND=noninteractive \
    COMPOSER_ALLOW_SUPERUSER=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        php8.3-apcu \
        php8.3-bcmath \
        php8.3-cli \
        php8.3-curl \
        php8.3-gd \
        php8.3-intl \
        php8.3-mbstring \
        php8.3-mysql \
        php8.3-soap \
        php8.3-xml \
        php8.3-zip \
        unzip \
        wget \
        xz-utils \
        zip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL --retry 3 --connect-timeout 20 \
        "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
        -o /tmp/node.tar.xz \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm /tmp/node.tar.xz \
    && node --version \
    && npm --version \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 300000

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

WORKDIR /var/www/html
RUN wget -q -O /tmp/prestashop.zip "${PRESTASHOP_ARCHIVE_URL}" \
    && unzip -q /tmp/prestashop.zip -d /tmp \
    && cp -a "/tmp/PrestaShop-${PRESTASHOP_VERSION}/." /var/www/html/ \
    && rm -rf /tmp/prestashop.zip "/tmp/PrestaShop-${PRESTASHOP_VERSION}"

COPY src/ /opt/overlay/

RUN cp -a /opt/overlay/. /var/www/html/ \
    && sed -i \
        -e 's#$error = Currency::refreshCurrencies();#$error = null;#' \
        -e 's#Currency::refreshCurrencies();#// Currency refresh disabled for offline challenge builds.#' \
        /var/www/html/classes/LocalizationPack.php \
    && composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader \
    && curl -fsSL --retry 3 --connect-timeout 20 \
        "https://i18n.prestashop-project.org/translations/${PRESTASHOP_VERSION}/en-US/en-US.zip" \
        -o /var/www/html/translations/sf-en-US.zip \
    && cd /var/www/html/admin-dev/themes/new-theme \
    && npm ci --legacy-peer-deps --no-audit --no-fund \
    && npm run build \
    && cd /var/www/html/themes/classic/_dev \
    && npm ci --legacy-peer-deps --no-audit --no-fund \
    && npm run build \
    && rm -rf /var/www/html/admin-dev/themes/new-theme/node_modules \
        /var/www/html/themes/classic/_dev/node_modules \
        /root/.npm \
        /root/.composer/cache \
        /opt/overlay \
        /var/www/html/tests \
        /var/www/html/.github \
        /var/www/html/.docker \
        /var/www/html/docs \
        /var/www/html/docker \
        /var/www/html/bot \
        /var/www/html/internal \
        /var/www/html/docker-compose*.yml

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    APACHE_RUN_USER=www-data \
    APACHE_RUN_GROUP=www-data \
    APACHE_LOG_DIR=/var/log/apache2 \
    APACHE_LOCK_DIR=/var/lock/apache2 \
    APACHE_PID_FILE=/var/run/apache2/apache2.pid

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        apache2 \
        ca-certificates \
        curl \
        libapache2-mod-php8.3 \
        mariadb-client \
        php8.3 \
        php8.3-apcu \
        php8.3-bcmath \
        php8.3-cli \
        php8.3-curl \
        php8.3-gd \
        php8.3-intl \
        php8.3-mbstring \
        php8.3-mysql \
        php8.3-soap \
        php8.3-xml \
        php8.3-zip \
    && rm -rf /var/lib/apt/lists/*

RUN a2enmod rewrite headers expires \
    && printf '%s\n' \
        'ServerName localhost' \
        '<VirtualHost *:80>' \
        '    ServerAdmin webmaster@localhost' \
        '    DocumentRoot /var/www/html' \
        '    DirectoryIndex index.php index.html' \
        '    <Directory /var/www/html>' \
        '        Options FollowSymLinks' \
        '        AllowOverride All' \
        '        Require all granted' \
        '    </Directory>' \
        '    <Directory /var/www/html/install-dev>' \
        '        Require all denied' \
        '    </Directory>' \
        '    ErrorLog ${APACHE_LOG_DIR}/error.log' \
        '    CustomLog ${APACHE_LOG_DIR}/access.log combined' \
        '</VirtualHost>' \
        > /etc/apache2/sites-available/000-default.conf \
    && printf '%s\n' \
        'memory_limit=512M' \
        'upload_max_filesize=32M' \
        'post_max_size=32M' \
        'max_execution_time=300' \
        'date.timezone=UTC' \
        > /etc/php/8.3/apache2/conf.d/99-anishop.ini \
    && cp /etc/php/8.3/apache2/conf.d/99-anishop.ini /etc/php/8.3/cli/conf.d/99-anishop.ini

WORKDIR /var/www/html
COPY --from=app-builder --chown=www-data:www-data /var/www/html/ /var/www/html/

RUN rm -f /var/www/html/index.html \
    && mkdir -p /var/www/html/var/cache /var/www/html/var/logs /var/www/html/upload /var/www/html/download \
    && chown -R www-data:www-data \
        /var/www/html/var \
        /var/www/html/upload \
        /var/www/html/download \
        /var/www/html/img \
        /var/www/html/config \
        /var/www/html/app/config

COPY src/docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY src/docker/init.php /opt/anishop/init.php
COPY src/docker/anime-assets /opt/anishop/anime-assets
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["apachectl", "-D", "FOREGROUND"]
