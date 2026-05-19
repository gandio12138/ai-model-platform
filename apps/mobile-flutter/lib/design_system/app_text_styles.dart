import 'package:flutter/material.dart';

import 'app_colors.dart';

class AppTextStyles {
  static const display = TextStyle(
    color: AppColors.text,
    fontSize: 32,
    fontWeight: FontWeight.w800,
    height: 1.16,
  );
  static const title = TextStyle(
    color: AppColors.text,
    fontSize: 22,
    fontWeight: FontWeight.w800,
    height: 1.24,
  );
  static const subtitle = TextStyle(
    color: AppColors.text,
    fontSize: 17,
    fontWeight: FontWeight.w700,
    height: 1.35,
  );
  static const body = TextStyle(
    color: AppColors.text,
    fontSize: 15,
    fontWeight: FontWeight.w500,
    height: 1.55,
  );
  static const muted = TextStyle(
    color: AppColors.textMuted,
    fontSize: 13,
    height: 1.45,
  );
  static const label = TextStyle(
    color: AppColors.textMuted,
    fontSize: 12,
    fontWeight: FontWeight.w700,
    letterSpacing: .2,
  );

  static const textTheme = TextTheme(
    headlineLarge: display,
    titleLarge: title,
    titleMedium: subtitle,
    bodyLarge: body,
    bodyMedium: body,
    labelMedium: label,
  );
}
