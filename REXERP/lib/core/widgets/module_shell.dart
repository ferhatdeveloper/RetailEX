import 'package:flutter/material.dart';

import '../../features/accounting/presentation/accounting_screen.dart';
import '../../features/beauty/presentation/beauty_screen.dart';
import '../../features/dashboard/presentation/dashboard_screen.dart';
import '../../features/management/presentation/management_screen.dart';
import '../../features/pos/presentation/pos_screen.dart';
import '../../features/restaurant/presentation/restaurant_screen.dart';
import '../../features/wms/presentation/wms_screen.dart';
import '../navigation/module_key.dart';
import 'flat_panel.dart';

class ModuleShell extends StatefulWidget {
  const ModuleShell({super.key});

  @override
  State<ModuleShell> createState() => _ModuleShellState();
}

class _ModuleShellState extends State<ModuleShell> {
  ModuleKey _selected = ModuleKey.dashboard;

  final List<_ModuleItem> _items = const [
    _ModuleItem(ModuleKey.dashboard, 'Dashboard', Icons.dashboard_rounded),
    _ModuleItem(ModuleKey.pos, 'POS', Icons.point_of_sale_rounded),
    _ModuleItem(ModuleKey.management, 'Yonetim', Icons.storefront_rounded),
    _ModuleItem(ModuleKey.wms, 'WMS', Icons.inventory_2_rounded),
    _ModuleItem(ModuleKey.restaurant, 'Restoran', Icons.restaurant_rounded),
    _ModuleItem(ModuleKey.beauty, 'Guzellik', Icons.spa_rounded),
    _ModuleItem(ModuleKey.accounting, 'Muhasebe', Icons.account_balance_rounded),
  ];

  Widget _buildContent() {
    switch (_selected) {
      case ModuleKey.dashboard:
        return const DashboardScreen();
      case ModuleKey.pos:
        return const PosScreen();
      case ModuleKey.management:
        return const ManagementScreen();
      case ModuleKey.wms:
        return const WmsScreen();
      case ModuleKey.restaurant:
        return const RestaurantScreen();
      case ModuleKey.beauty:
        return const BeautyScreen();
      case ModuleKey.accounting:
        return const AccountingScreen();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.sizeOf(context).width < 980;
    final selectedIndex = _items.indexWhere((item) => item.key == _selected);
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text('REXERP - ${_items[selectedIndex].title}'),
      ),
      drawer: isMobile
          ? Drawer(
              backgroundColor: Theme.of(context).scaffoldBackgroundColor,
              child: SafeArea(
                child: ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    FlatPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'REXERP',
                            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Flat desktop UI skeleton',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    ..._items.map(
                      (item) => ListTile(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                          side: BorderSide(
                            color: _selected == item.key ? scheme.primary : scheme.outlineVariant,
                          ),
                        ),
                        leading: Icon(item.icon),
                        title: Text(item.title),
                        selected: _selected == item.key,
                        selectedTileColor: scheme.surface,
                        onTap: () {
                          setState(() => _selected = item.key);
                          Navigator.of(context).pop();
                        },
                      ),
                    ),
                  ],
                ),
              ),
            )
          : null,
      body: Row(
        children: [
          if (!isMobile)
            Container(
              width: 260,
              padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
              child: FlatPanel(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'REXERP',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'RetailEX base UI',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    Expanded(
                      child: ListView.separated(
                        itemCount: _items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final item = _items[index];
                          final isSelected = item.key == _selected;
                          return ListTile(
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                              side: BorderSide(
                                color: isSelected ? scheme.primary : scheme.outlineVariant,
                              ),
                            ),
                            tileColor: isSelected ? scheme.primaryContainer : scheme.surface,
                            leading: Icon(item.icon),
                            title: Text(item.title),
                            onTap: () {
                              setState(() => _selected = item.key);
                            },
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 12, 16, 16),
              child: _buildContent(),
            ),
          ),
        ],
      ),
    );
  }
}

class _ModuleItem {
  const _ModuleItem(this.key, this.title, this.icon);

  final ModuleKey key;
  final String title;
  final IconData icon;
}
