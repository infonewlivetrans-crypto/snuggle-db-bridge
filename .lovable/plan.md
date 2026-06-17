# Текущий этап: онбординг перевозчика (MVP)

Реализовано:
- Миграция `20260617_*`: новые поля в `dispatcher_carrier_ext`/`_driver_ext`/`_vehicle_ext`, снято unique с `assigned_driver_ext_id`.
- `GET /api/carrier/onboarding-status` — серверная проверка готовности.
- `GET/PATCH /api/carrier/carrier-ext` — чтение/правка расширенных полей перевозчика (ATI, реквизиты, налоговый режим).
- `OnboardingChecklist` — компонент чек-листа.
- `/carrier/onboarding` — страница мастера (6 секций).
- `/carrier` — наверху показывает чек-лист.
- `/api/dispatcher/free-vehicles` — гейт: машина без водителя/местоположения на карту не попадает.
