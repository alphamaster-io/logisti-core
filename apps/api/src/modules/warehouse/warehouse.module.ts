import { Module } from '@nestjs/common';
import { WarehouseController } from './warehouse.controller';

@Module({
  controllers: [WarehouseController],
})
export class WarehouseModule {}
