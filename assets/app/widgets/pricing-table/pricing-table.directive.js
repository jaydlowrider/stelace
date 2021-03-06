(function () {

    angular
        .module("app.widgets")
        .directive("sipPricingTable", sipPricingTable);

    function sipPricingTable(BookingService, ListingService, pricing, tools) {
        var priceResult;

        /**
         * {object}  booking - if provided, it autofills variables
         * {object}  listing
         * {number}  maxBookingDuration
         * {object}  data - to get data from internal to external
         *
         * {object}  bookingParams
         * {string}  bookingParams.startDate
         * {string}  bookingParams.endDate
         * {string}  bookingParams.nbTimeUnits
         * {string}  bookingParams.quantity
         * {string}  bookingParams.useDuration
         * {boolean} [bookingParams.applyFreeFees = false]
         */
        return {
            restrict: "EA",
            scope: {
                booking: "=?",
                listingType: "=?",
                listing: "=",
                bookingParams: "=?",
                data: "=?"
            },
            link: link,
            templateUrl: "/assets/app/widgets/pricing-table/pricing-table.html"
        };

        function link(scope) {
            init();

            // if listing is changed, recompute all data (all params depend on listing)
            scope.$watch("listing", function (newValue, oldValue) {
                // do not init twice
                if (newValue === oldValue) {
                    return;
                }

                init();
            });

            scope.$watch("booking", function (newValue, oldValue) {
                // do not init twice
                if (newValue === oldValue) {
                    return;
                }

                init();
            });

            scope.$watchGroup([
                "listingType",
            ], function (newValue, oldValue) {
                // do not init twice
                if (newValue === oldValue) {
                    return;
                }

                // if booking is set, do not care the changes
                if (scope.booking) {
                    return;
                }

                init();
            });

            // only booking params change, so do not recompute booking config
            scope.$watch("bookingParams", function (newValue, oldValue) {
                // do not init twice
                if (newValue === oldValue) {
                    return;
                }

                // if booking is set, do not care the changes
                if (scope.booking) {
                    return;
                }

                setBookingParams();
            }, true);



            ////////////////////
            // IMPLEMENTATION //
            ////////////////////
            function init() {
                if (scope.booking) {
                    scope.applyFreeFees = scope.booking.priceData.takerFreeFees;
                }

                scope.dependStock = isPricingDependStock();
                scope.dependDuration = isPricingDependDuration();
                populateListing();
                setBookingParams();
            }

            function populateListing() {
                if (!scope.listing) {
                    return;
                }
                if (!scope.dependDuration) {
                    return;
                }

                var listingType = getListingType();
                var nbTimeUnits;

                if (scope.booking) {
                    // no need to compute more than booking nb booked days
                    nbTimeUnits = scope.booking.nbTimeUnits;
                } else {
                    nbTimeUnits = listingType.config.bookingTime.maxDuration || 100;
                }

                ListingService.populate(scope.listing, {
                    nbTimeUnits: nbTimeUnits
                });
            }

            function getTimeUnit() {
                if (scope.booking) {
                    return scope.booking.timeUnit;
                } else {
                    var listingType = getListingType();
                    return listingType.config.bookingTime.timeUnit;
                }
            }

            function getBookingDuration() {
                if (!scope.dependDuration) {
                    return 0;
                }

                if (scope.booking) {
                    return scope.booking.nbTimeUnits;
                }

                if (scope.bookingParams.useDuration) {
                    return scope.bookingParams.nbTimeUnits || 1;
                }

                var listingType = getListingType();
                return BookingService.getNbTimeUnits(scope.startDate, scope.endDate, listingType.config.bookingTime.timeUnit);
            }

            function setBookingParams() {
                if (scope.booking) {
                    scope.startDate     = scope.booking.startDate;
                    scope.endDate       = scope.booking.endDate;
                    scope.applyFreeFees = scope.booking.applyFreeFees || false;
                    scope.quantity      = scope.booking.quantity;
                    scope.timeUnitPrice = scope.booking.timeUnitPrice;
                } else {
                    scope.startDate     = scope.bookingParams.startDate;
                    scope.endDate       = scope.bookingParams.endDate;
                    scope.applyFreeFees = scope.bookingParams.applyFreeFees || false;
                    scope.quantity      = scope.bookingParams.quantity;
                    scope.timeUnitPrice = scope.listing.prices[0];
                }

                scope.timeUnit         = getTimeUnit();
                scope.nbTimeUnits      = getBookingDuration();
                priceResult            = getPriceResult();

                scope.basePrice        = getBasePrice();
                scope.fullPrice        = getFullPrice();
                scope.durationDiscount = getDurationDiscount();
                scope.takerFees        = getTakerFees();
                scope.totalPrice       = getTotalPrice();
                scope.dailyPrice       = getDailyPrice();

                // copy isolated scope to external
                if (typeof scope.data === "object") {
                    _.forEach(_.keys(scope.data), function (field) {
                        scope.data[field] = scope[field];
                    });
                }
            }

            function getListingType() {
                if (scope.booking) {
                    return scope.booking.listingType;
                } else {
                    return scope.listingType;
                }
            }

            function isPricingDependStock() {
                var listingType = getListingType();
                return listingType.properties.AVAILABILITY === 'STOCK';
            }

            function isPricingDependDuration() {
                var listingType = getListingType();
                return listingType.properties.TIME === 'TIME_FLEXIBLE';
            }

            function getBasePrice() {
                if (scope.dependDuration) {
                    return scope.nbTimeUnits * scope.timeUnitPrice;
                } else {
                    if (scope.booking) {
                        return scope.booking.ownerPriceUnit;
                    } else {
                        return scope.listing.sellingPrice;
                    }
                }
            }

            function getRealBasePrice() {
                if (scope.booking) {
                    return scope.booking.ownerPriceUnit;
                }

                if (scope.dependDuration) {
                    return scope.listing.prices[scope.nbTimeUnits - 1];
                } else {
                    return scope.listing.sellingPrice;
                }
            }

            function getFullPrice() {
                return scope.quantity * getBasePrice();
            }

            function getRealFullPrice() {
                return scope.quantity * getRealBasePrice();
            }

            function getDurationDiscount() {
                return Math.max(0, scope.quantity * Math.round(getBasePrice() - getRealBasePrice()));
            }

            function getPriceResult() {
                var priceResult;
                var listingType = getListingType();

                if (scope.booking) {
                    priceResult = pricing.getPriceAfterRebateAndFees({ booking: scope.booking });
                } else {
                    priceResult = pricing.getPriceAfterRebateAndFees({
                        ownerPrice: getRealFullPrice(),
                        freeValue: 0,
                        ownerFeesPercent: 0, // do not care about owner fees
                        takerFeesPercent: ! scope.applyFreeFees ? getTakerFeesPercent() : 0,
                        maxDiscountPercent: listingType.config.pricing.maxDiscountPercent
                    });
                }

                return priceResult;
            }

            function getTakerFeesPercent() {
                if (scope.booking) {
                    return scope.booking.takerFeesPercent;
                }

                var listingType = getListingType();
                return listingType.config.pricing.takerFeesPercent || 0;
            }

            function getTakerFees() {
                return priceResult.takerFees;
            }

            function getTotalPrice() {
                return priceResult.takerPrice;
            }

            function getDailyPrice() {
                if (!scope.dependDuration) {
                    return 0;
                }

                return tools.roundDecimal(getTotalPrice(priceResult) / scope.nbTimeUnits, 1);
            }
        }
    }

})();
