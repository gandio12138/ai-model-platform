import 'dart:io' show Platform;

enum AppFlavor { dev, staging, prod }

enum AppPlatform { ios, android, web, macos, unknown }

class AppEnv {
  const AppEnv({
    required this.flavor,
    required this.apiBaseUrl,
    required this.appName,
    required this.appVersion,
    required this.packageName,
    required this.bundleId,
    required this.distributionChannel,
    required this.region,
    required this.allowMockData,
    required this.debugBanner,
  });

  final AppFlavor flavor;
  final String apiBaseUrl;
  final String appName;
  final String appVersion;
  final String packageName;
  final String bundleId;
  final String distributionChannel;
  final String region;
  final bool allowMockData;
  final bool debugBanner;

  bool get isProd => flavor == AppFlavor.prod;
  String get flavorName => flavor.name;

  AppEnv copyWith({String? apiBaseUrl}) {
    return AppEnv(
      flavor: flavor,
      apiBaseUrl: apiBaseUrl ?? this.apiBaseUrl,
      appName: appName,
      appVersion: appVersion,
      packageName: packageName,
      bundleId: bundleId,
      distributionChannel: distributionChannel,
      region: region,
      allowMockData: allowMockData,
      debugBanner: debugBanner,
    );
  }

  AppPlatform get platform {
    try {
      if (Platform.isIOS) return AppPlatform.ios;
      if (Platform.isAndroid) return AppPlatform.android;
      if (Platform.isMacOS) return AppPlatform.macos;
    } catch (_) {
      return AppPlatform.web;
    }
    return AppPlatform.unknown;
  }

  String get platformName {
    final resolved = platform;
    if (resolved == AppPlatform.macos && flavor == AppFlavor.dev) {
      return 'ios';
    }
    return switch (resolved) {
      AppPlatform.ios => 'ios',
      AppPlatform.android => 'android',
      AppPlatform.web => 'web',
      AppPlatform.macos => 'macos',
      AppPlatform.unknown => 'unknown',
    };
  }

  static AppEnv fromDefines() {
    final flavor = switch (const String.fromEnvironment(
      'APP_FLAVOR',
      defaultValue: 'dev',
    )) {
      'prod' => AppFlavor.prod,
      'staging' => AppFlavor.staging,
      _ => AppFlavor.dev,
    };
    return AppEnv(
      flavor: flavor,
      apiBaseUrl: const String.fromEnvironment(
        'API_BASE_URL',
        defaultValue: 'http://127.0.0.1:4000',
      ),
      appName: const String.fromEnvironment(
        'APP_NAME',
        defaultValue: 'oToken Dev',
      ),
      appVersion: const String.fromEnvironment(
        'APP_VERSION',
        defaultValue: '1.0.0',
      ),
      packageName: const String.fromEnvironment(
        'PACKAGE_NAME',
        defaultValue: 'com.otoken.app.dev',
      ),
      bundleId: const String.fromEnvironment(
        'BUNDLE_ID',
        defaultValue: 'com.otoken.app.dev',
      ),
      distributionChannel: const String.fromEnvironment(
        'DISTRIBUTION_CHANNEL',
        defaultValue: 'dev_local',
      ),
      region: const String.fromEnvironment('REGION', defaultValue: 'CN'),
      allowMockData: const bool.fromEnvironment(
        'USE_MOCKS',
        defaultValue: true,
      ),
      debugBanner: flavor != AppFlavor.prod,
    );
  }

  factory AppEnv.dev() => const AppEnv(
    flavor: AppFlavor.dev,
    apiBaseUrl: String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://127.0.0.1:4000',
    ),
    appName: 'oToken Dev',
    appVersion: String.fromEnvironment('APP_VERSION', defaultValue: '1.0.0'),
    packageName: 'com.otoken.app.dev',
    bundleId: 'com.otoken.app.dev',
    distributionChannel: String.fromEnvironment(
      'DISTRIBUTION_CHANNEL',
      defaultValue: 'dev_local',
    ),
    region: String.fromEnvironment('REGION', defaultValue: 'CN'),
    allowMockData: bool.fromEnvironment('USE_MOCKS', defaultValue: true),
    debugBanner: true,
  );

  factory AppEnv.staging() => const AppEnv(
    flavor: AppFlavor.staging,
    apiBaseUrl: String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'https://xufongnian.xyz',
    ),
    appName: 'oToken Staging',
    appVersion: String.fromEnvironment('APP_VERSION', defaultValue: '1.0.0'),
    packageName: 'com.otoken.app.staging',
    bundleId: 'com.otoken.app.staging',
    distributionChannel: String.fromEnvironment(
      'DISTRIBUTION_CHANNEL',
      defaultValue: 'testflight_or_internal',
    ),
    region: String.fromEnvironment('REGION', defaultValue: 'CN'),
    allowMockData: bool.fromEnvironment('USE_MOCKS', defaultValue: false),
    debugBanner: true,
  );

  factory AppEnv.prod() => const AppEnv(
    flavor: AppFlavor.prod,
    apiBaseUrl: String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'https://xufongnian.xyz',
    ),
    appName: 'oToken',
    appVersion: String.fromEnvironment('APP_VERSION', defaultValue: '1.0.0'),
    packageName: 'com.otoken.app',
    bundleId: 'com.otoken.app',
    distributionChannel: String.fromEnvironment(
      'DISTRIBUTION_CHANNEL',
      defaultValue: 'app_store_or_official',
    ),
    region: String.fromEnvironment('REGION', defaultValue: 'CN'),
    allowMockData: false,
    debugBanner: false,
  );
}
