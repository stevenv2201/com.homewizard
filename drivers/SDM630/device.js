'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');

const POLL_INTERVAL = 1000 * 10; // 10 seconds

module.exports = class HomeWizardEnergyDevice extends Homey.Device {

  onInit() {
    this.onPollInterval = setInterval(this.onPoll.bind(this), POLL_INTERVAL);
  }

  onDeleted() {
    if( this.onPollInterval ) {
      clearInterval(this.onPollInterval);
    }
  }

  async onDiscoveryAvailable(discoveryResult) {
    this.url = `http://${discoveryResult.address}:${discoveryResult.port}${discoveryResult.txt.path}`;
    this.log(`URL: ${this.url}`);
    this.onPoll();
  }

  onDiscoveryAddressChanged(discoveryResult) {
    this.url = `http://${discoveryResult.address}:${discoveryResult.port}${discoveryResult.txt.path}`;
    this.log(`URL: ${this.url}`);
    this.onPoll();
  }

  onPoll() {
    if( !this.url ) return;

    Promise.resolve().then(async () => {
      const res = await fetch(`${this.url}/data`);
      if( !res.ok )
        throw new Error(res.statusText);

      const data = await res.json();

      // Save export data check if capabilities are present first
      if (!this.hasCapability('measure_power')) {
        await this.addCapability('measure_power').catch(this.error);
      }

      if (!this.hasCapability('meter_power.consumed.t1')) {
        await this.addCapability('meter_power.consumed.t1').catch(this.error);
      //  await this.addCapability('meter_power.consumed.t2').catch(this.error);
      }

      // Update values 3phase kwh
      // KWH 1 fase
      // total_power_import_t1_kwh *
      // total_power_export_t1_kwh *
      // active_power_w
      // active_power_l1_w
      // active_power_l2_w
      // active_power_l3_w

      await this.setCapabilityValue('measure_power', data.active_power_w).catch(this.error);
      await this.setCapabilityValue('meter_power.consumed.t1', data.total_power_import_t1_kwh).catch(this.error);
      //await this.setCapabilityValue('meter_power.consumed.t2', data.total_power_import_t2_kwh).catch(this.error);

      // Check to see if there is solar panel production exported if received value is more than 1 it returned back to the power grid
      if (data.total_power_export_t1_kwh > 1) {
								if (!this.hasCapability('meter_power.produced.t1')) {
                  // add production meters
									await this.addCapability('meter_power.produced.t1').catch(this.error);
								}
                // update values for solar production
								await this.setCapabilityValue('meter_power.produced.t1', data.total_power_export_t1_kwh).catch(this.error);
			}
      else if (data.total_power_export_t1_kwh < 1) {
              await this.removeCapability('meter_power.produced.t1').catch(this.error);
      }

      // aggregated meter for Power by the hour support
      if (!this.hasCapability('meter_power')) {
          await this.addCapability('meter_power').catch(this.error);
      }
      // update calculated value which is sum of import deducted by the sum of the export this overall kwh number is used for Power by the hour app
      this.setCapabilityValue('meter_power', (data.total_power_import_t1_kwh-data.total_power_export_t1_kwh)).catch(this.error);

      // Phase 3 support when meter has values active_power_l2_w will be valid else ignore ie the power grid is a Phase1 household connection
     if (data.active_power_l2_w !== null) {
         if (!this.hasCapability('measure_power.l2')) {
           await this.addCapability('measure_power.l1').catch(this.error);
           await this.addCapability('measure_power.l2').catch(this.error);
           await this.addCapability('measure_power.l3').catch(this.error);
        }
        this.setCapabilityValue('measure_power.l1', data.active_power_l1_w).catch(this.error);
        this.setCapabilityValue('measure_power.l2', data.active_power_l2_w).catch(this.error);
        this.setCapabilityValue('measure_power.l3', data.active_power_l3_w).catch(this.error);
      }
      else if (data.active_power_l2_w == null) {
        if (this.hasCapability('measure_power.l2')) {
          await this.removeCapability('measure_power.l1').catch(this.error);
          await this.removeCapability('measure_power.l2').catch(this.error);
          await this.removeCapability('measure_power.l3').catch(this.error);
          await this.removeCapability('measure_power.active_power_w').catch(this.error);
        }
      }

    })
      .then(() => {
        this.setAvailable().catch(this.error);
      })
      .catch(err => {
        this.error(err);
        this.setUnavailable(err).catch(this.error);
      })
  }

}
