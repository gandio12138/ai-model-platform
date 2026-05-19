import 'package:flutter/material.dart';

import 'app_colors.dart';

class AppBadge extends StatelessWidget {
  const AppBadge({
    required this.label,
    super.key,
    this.color = AppColors.primary,
    this.soft = true,
  });

  final String label;
  final Color color;
  final bool soft;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: soft ? color.withValues(alpha: .1) : color,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: soft ? color : Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}
