import 'package:flutter/material.dart';

import '../../../core/widgets/flat_panel.dart';

class BeautyScreen extends StatelessWidget {
  const BeautyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return FlatPanel(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Guzellik Modulu',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 8),
          const Text('Randevu takvimi, uzman yonetimi, CRM ve package satis ekranlari bu bolumde olacak.'),
          const SizedBox(height: 16),
          const Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Chip(label: Text('Randevular')),
              Chip(label: Text('Uzmanlar')),
              Chip(label: Text('CRM')),
              Chip(label: Text('Appointment POS')),
            ],
          ),
        ],
      ),
    );
  }
}
