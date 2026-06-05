import { ServiceProvider } from '@rudderjs/core'

export class AppServiceProvider extends ServiceProvider {
  register(): void {
    // Register any application services here.
  }

  async boot(): Promise<void> {
    // console.log(`[AppServiceProvider] booted — app: ${this.app.name}`)
  }
}
