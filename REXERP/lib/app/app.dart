import 'package:flutter/material.dart';

import '../core/navigation/app_routes.dart';
import '../core/widgets/module_shell.dart';
import '../features/system/presentation/login_screen.dart';
import 'theme/rex_theme.dart';

class RexErpApp extends StatelessWidget {
  const RexErpApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'REXERP',
      debugShowCheckedModeBanner: false,
      theme: RexTheme.light(),
      darkTheme: RexTheme.dark(),
      themeMode: ThemeMode.system,
      initialRoute: AppRoutes.login,
      routes: {
        AppRoutes.login: (_) => const LoginScreen(),
        AppRoutes.shell: (_) => const ModuleShell(),
      },
    );
  }
}
