import '../../app/env.dart';
import '../constants/app_constants.dart';

class AppLaunchContext {
  const AppLaunchContext({
    required this.platform,
    required this.appVersion,
    required this.packageName,
    required this.bundleId,
    required this.distributionChannel,
    required this.region,
    required this.tenantCode,
    required this.projectCode,
    required this.deviceId,
  });

  final String platform;
  final String appVersion;
  final String packageName;
  final String bundleId;
  final String distributionChannel;
  final String region;
  final String tenantCode;
  final String projectCode;
  final String deviceId;

  factory AppLaunchContext.fromEnv(AppEnv env) {
    const tenantCode = String.fromEnvironment(
      'TENANT_CODE',
      defaultValue: AppConstants.defaultTenantCode,
    );
    const configuredProjectCode = String.fromEnvironment(
      'PROJECT_CODE',
      defaultValue: '',
    );
    final projectCode = configuredProjectCode.isNotEmpty
        ? configuredProjectCode
        : switch (env.platformName) {
            'ios' => AppConstants.defaultIosProjectCode,
            'android' => AppConstants.defaultAndroidProjectCode,
            _ => AppConstants.defaultProjectCode,
          };

    return AppLaunchContext(
      platform: env.platformName,
      appVersion: env.appVersion,
      packageName: env.packageName,
      bundleId: env.bundleId,
      distributionChannel: env.distributionChannel,
      region: env.region,
      tenantCode: tenantCode,
      projectCode: projectCode,
      deviceId: 'device-${env.flavorName}',
    );
  }

  Map<String, dynamic> toQuery() {
    return {
      'platform': platform,
      'app_version': appVersion,
      'package_name': packageName,
      'bundle_id': bundleId,
      'distribution_channel': distributionChannel,
      'region': region,
      'tenant_code': tenantCode,
      'project_code': projectCode,
      'device_id': deviceId,
    };
  }

  Map<String, String> toHeaders() {
    return {
      'x-platform': platform,
      'x-app-version': appVersion,
      'x-package-name': packageName,
      'x-bundle-id': bundleId,
      'x-distribution-channel': distributionChannel,
      'x-region': region,
      'x-tenant-code': tenantCode,
      'x-project-code': projectCode,
      'x-device-id': deviceId,
    };
  }
}
