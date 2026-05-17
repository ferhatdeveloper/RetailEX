import 'package:flutter/material.dart';

import '../../features/accounting/presentation/accounting_screen.dart';
import '../../features/beauty/presentation/beauty_screen.dart';
import '../../features/dashboard/presentation/dashboard_screen.dart';
import '../../features/management/presentation/management_screen.dart';
import '../../features/pos/presentation/pos_screen.dart';
import '../../features/restaurant/presentation/restaurant_screen.dart';
import '../../features/wms/presentation/wms_screen.dart';
import '../navigation/module_key.dart';

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
    return Scaffold(
      appBar: AppBar(
        title: Text('REXERP - ${_items[selectedIndex].title}'),
      ),
      drawer: isMobile
          ? Drawer(
              child: SafeArea(
                child: ListView(
                  children: [
                    const ListTile(
                      title: Text(
                        'REXERP',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                      ),
                      subtitle: Text('RetailEX tabanli UI yapisi'),
                    ),
                    const Divider(height: 1),
                    ..._items.map(
                      (item) => ListTile(
                        leading: Icon(item.icon),
                        title: Text(item.title),
                        selected: _selected == item.key,
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
            NavigationRail(
              selectedIndex: selectedIndex,
              onDestinationSelected: (index) {
                setState(() => _selected = _items[index].key);
              },
              labelType: NavigationRailLabelType.all,
              minWidth: 88,
              destinations: [
                for (final item in _items)
                  NavigationRailDestination(
                    icon: Icon(item.icon),
                    label: Text(item.title),
                  ),
              ],
            ),
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(20),
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
