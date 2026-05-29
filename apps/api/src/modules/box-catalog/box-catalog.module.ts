import { Module } from '@nestjs/common';
import { BoxCatalogController } from './box-catalog.controller';
import { BoxCatalogService } from './box-catalog.service';

@Module({
  controllers: [BoxCatalogController],
  providers: [BoxCatalogService],
  exports: [BoxCatalogService],
})
export class BoxCatalogModule {}
