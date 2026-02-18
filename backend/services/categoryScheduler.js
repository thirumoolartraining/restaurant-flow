const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const cron = require('node-cron');
const logger = require('./logger');

class CategoryScheduler {
  constructor() {
    this.jobs = new Map();
  }

  // Get current time in specified timezone
  getCurrentTimeInTimezone(timezone = 'Asia/Kolkata') {
    const now = new Date();
    // Get time string in the specified timezone
    const options = {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short'
    };
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    
    let hours = 0;
    let minutes = 0;
    let weekday = '';
    
    for (const part of parts) {
      if (part.type === 'hour') hours = parseInt(part.value);
      if (part.type === 'minute') minutes = parseInt(part.value);
      if (part.type === 'weekday') weekday = part.value;
    }
    
    // Map weekday to day number (0=Sunday, 1=Monday, etc.)
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const dayNumber = dayMap[weekday] ?? new Date().getDay();
    
    return { hours, minutes, dayNumber };
  }

  // Check if current time is within schedule
  isWithinSchedule(schedule) {
    if (!schedule || !schedule.enabled) {
      return true; // No schedule means always available
    }

    // Use timezone from schedule, default to Asia/Kolkata
    const timezone = schedule.timezone || 'Asia/Kolkata';
    const { hours: currentHours, minutes: currentMins, dayNumber: currentDay } = this.getCurrentTimeInTimezone(timezone);
    const currentTime = `${currentHours.toString().padStart(2, '0')}:${currentMins.toString().padStart(2, '0')}`;
    
    let startTime, endTime;
    
    // Check for custom days with individual times
    if (schedule.type === 'custom' && schedule.customDays && schedule.customDays.length > 0) {
      // Find today's schedule
      const todaySchedule = schedule.customDays.find(d => d.day === currentDay);
      
      if (!todaySchedule || !todaySchedule.enabled) {
        logger.info('[Category Scheduler] Not scheduled for today or day disabled', { dayNumber: currentDay });
        return false; // Not scheduled for today or day is disabled
      }
      
      startTime = todaySchedule.startTime;
      endTime = todaySchedule.endTime;
      logger.info('[Category Scheduler] Custom day schedule', { dayNumber: currentDay, startTime, endTime });
    }
    // Backward compatibility: custom type with days array (same time for all days)
    else if (schedule.type === 'custom' && schedule.days && schedule.days.length > 0) {
      if (!schedule.days.includes(currentDay)) {
        logger.info('[Category Scheduler] Not scheduled for today', { dayNumber: currentDay });
        return false; // Not scheduled for today
      }
      startTime = schedule.startTime;
      endTime = schedule.endTime;
    }
    // Daily schedule (same time every day)
    else {
      if (!schedule.startTime || !schedule.endTime) {
        return true; // No time set means always available
      }
      startTime = schedule.startTime;
      endTime = schedule.endTime;
    }

    // Parse time strings (HH:MM format)
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const currentMinutes = currentHours * 60 + currentMins;
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    logger.info('[Category Scheduler] Time check', { timezone, currentTime, currentMinutes, startTime, startMinutes, endTime, endMinutes });

    // Handle overnight schedules (e.g., 22:00 to 02:00)
    if (endMinutes < startMinutes) {
      const isWithin = currentMinutes >= startMinutes || currentMinutes < endMinutes;
      logger.info('[Category Scheduler] Overnight schedule', { status: isWithin ? 'WITHIN' : 'OUTSIDE' });
      return isWithin;
    }

    // Normal schedule (e.g., 08:00 to 22:00)
    // Use < for end time so that at exactly end time, it's considered outside
    const isWithin = currentMinutes >= startMinutes && currentMinutes < endMinutes;
    logger.info('[Category Scheduler] Normal schedule', { status: isWithin ? 'WITHIN' : 'OUTSIDE' });
    return isWithin;
  }

  // Update category pause status based on schedule
  async updateCategoryStatus(categoryId) {
    try {
      const category = await Category.findById(categoryId);
      if (!category) {
        logger.info('[Category Scheduler] Category not found', { categoryId });
        return;
      }

      if (!category.schedule || !category.schedule.enabled) {
        logger.info('[Category Scheduler] Schedule not enabled, skipping', { name: category.name });
        return;
      }

      logger.info(`[Category Scheduler] Checking ${category.name}`, { type: category.schedule.type });
      if (category.schedule.type === 'custom' && category.schedule.customDays?.length > 0) {
        logger.info('[Category Scheduler] Custom Days', { customDays: category.schedule.customDays });
      } else if (category.schedule.type === 'custom') {
        logger.info('[Category Scheduler] Days with global times', { days: category.schedule.days, startTime: category.schedule.startTime, endTime: category.schedule.endTime });
      } else {
        logger.info('[Category Scheduler] Daily Schedule', { startTime: category.schedule.startTime, endTime: category.schedule.endTime });
      }

      const shouldBeActive = this.isWithinSchedule(category.schedule);
      const shouldBePaused = !shouldBeActive;

      logger.info('[Category Scheduler] Schedule result', { shouldBe: shouldBeActive ? 'ACTIVE' : 'PAUSED' });
      logger.info('[Category Scheduler] Current status', { isPaused: category.isPaused, isSoldOut: category.isSoldOut });

      // Only update if status needs to change
      // When within schedule, category should NOT be paused (isPaused = false)
      // When outside schedule, category should be paused (isPaused = true)
      // NOTE: Scheduled categories only set isPaused, NOT isSoldOut (sold out is separate manual action)
      if (category.isPaused !== shouldBePaused) {
        const oldStatus = category.isPaused ? 'PAUSED' : 'ACTIVE';
        const newStatus = shouldBePaused ? 'PAUSED' : 'ACTIVE';
        
        category.isPaused = shouldBePaused;
        // Do NOT set isSoldOut - that's for manual sold out action only
        await category.save();
        
        logger.info('[Category Scheduler] STATUS CHANGED', { name: category.name, from: oldStatus, to: newStatus });
        logger.info(`[Category Scheduler] ${category.name}: ${shouldBePaused ? 'LOCKED (outside schedule)' : 'RESUMED (within schedule)'}`);
        
        // When category RESUMES (becomes active), make all items in this category available
        if (!shouldBePaused) {
          const updateResult = await MenuItem.updateMany(
            { category: category.name, available: false },
            { $set: { available: true } }
          );
          if (updateResult.modifiedCount > 0) {
            logger.info('[Category Scheduler] Made items available', { count: updateResult.modifiedCount, category: category.name });
          } else {
            logger.info('[Category Scheduler] All items already available', { category: category.name });
          }
        }
      } else {
        logger.info('[Category Scheduler] No change needed', { status: category.isPaused ? 'paused' : 'active' });
      }
    } catch (error) {
      logger.error(`[Category Scheduler] Error updating category ${categoryId}`, { error: error.message });
    }
  }

  // Check if sold out schedule has expired
  isSoldOutExpired(soldOutSchedule) {
    if (!soldOutSchedule || !soldOutSchedule.enabled || !soldOutSchedule.endTime) {
      return false;
    }

    const timezone = soldOutSchedule.timezone || 'Asia/Kolkata';
    const { hours: currentHours, minutes: currentMins } = this.getCurrentTimeInTimezone(timezone);
    
    const [endHour, endMin] = soldOutSchedule.endTime.split(':').map(Number);
    
    const currentMinutes = currentHours * 60 + currentMins;
    const endMinutes = endHour * 60 + endMin;
    
    const currentTime = `${currentHours.toString().padStart(2, '0')}:${currentMins.toString().padStart(2, '0')}`;
    logger.info('[Category Scheduler] Sold out check', { timezone, currentTime, currentMinutes, endTime: soldOutSchedule.endTime, endMinutes });
    
    // Check if current time has passed the end time
    return currentMinutes >= endMinutes;
  }

  // Update sold out status based on schedule
  async updateSoldOutStatus(categoryId) {
    try {
      const category = await Category.findById(categoryId);
      if (!category) {
        logger.info('[Category Scheduler] Category not found for sold out check', { categoryId });
        return;
      }

      if (!category.soldOutSchedule || !category.soldOutSchedule.enabled) {
        return;
      }

      logger.info(`[Category Scheduler] Checking Sold Out for ${category.name}`, { endTime: category.soldOutSchedule.endTime });

      const isExpired = this.isSoldOutExpired(category.soldOutSchedule);
      
      if (isExpired) {
        logger.info('[Category Scheduler] Sold out period EXPIRED - resuming category');
        
        category.isSoldOut = false;
        category.soldOutSchedule.enabled = false;
        category.soldOutSchedule.endTime = null;
        await category.save();
        
        // When category RESUMES (sold out expires), make all items in this category available
        const updateResult = await MenuItem.updateMany(
          { category: category.name, available: false },
          { $set: { available: true } }
        );
        
        logger.info(`[Category Scheduler] ${category.name}: RESUMED (sold out expired)`);
        if (updateResult.modifiedCount > 0) {
          logger.info('[Category Scheduler] Made items available after sold out', { count: updateResult.modifiedCount, category: category.name });
        } else {
          logger.info('[Category Scheduler] All items already available after sold out', { category: category.name });
        }
      } else {
        logger.info('[Category Scheduler] Still sold out', { endTime: category.soldOutSchedule.endTime });
      }
    } catch (error) {
      logger.error(`[Category Scheduler] Error updating sold out status ${categoryId}`, { error: error.message });
    }
  }

  // Check all categories with schedules
  async checkAllSchedules() {
    try {
      // Use Asia/Kolkata timezone for logging
      const { hours, minutes, dayNumber } = this.getCurrentTimeInTimezone('Asia/Kolkata');
      const currentTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      const currentDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayNumber];
      
      logger.info('[Category Scheduler] Running check', { time: currentTime, day: currentDay });
      
      // Check availability schedules
      const categoriesWithSchedule = await Category.find({ 'schedule.enabled': true });
      
      if (categoriesWithSchedule.length > 0) {
        logger.info('[Category Scheduler] Found categories with availability schedules', { count: categoriesWithSchedule.length });
        for (const category of categoriesWithSchedule) {
          await this.updateCategoryStatus(category._id);
        }
      }
      
      // Check sold out schedules
      const categoriesWithSoldOut = await Category.find({ 'soldOutSchedule.enabled': true });
      
      if (categoriesWithSoldOut.length > 0) {
        logger.info('[Category Scheduler] Found categories with sold out schedules', { count: categoriesWithSoldOut.length });
        for (const category of categoriesWithSoldOut) {
          await this.updateSoldOutStatus(category._id);
        }
      }
      
      if (categoriesWithSchedule.length === 0 && categoriesWithSoldOut.length === 0) {
        logger.info('[Category Scheduler] No categories with schedules enabled');
      }
    } catch (error) {
      logger.error('[Category Scheduler] Error checking schedules', { error: error.message });
    }
  }

  // Start the scheduler (runs every minute)
  start() {
    // Run immediately on start
    this.checkAllSchedules();

    // Schedule to run every minute
    this.job = cron.schedule('* * * * *', () => {
      this.checkAllSchedules();
    });

    logger.info('[Category Scheduler] Started - checking schedules every minute');
  }

  // Stop the scheduler
  stop() {
    if (this.job) {
      this.job.stop();
      logger.info('[Category Scheduler] Stopped');
    }
  }
}

// Export singleton instance
const categoryScheduler = new CategoryScheduler();
module.exports = categoryScheduler;
